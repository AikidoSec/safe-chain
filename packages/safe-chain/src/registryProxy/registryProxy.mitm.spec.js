import { before, after, describe, it } from "node:test";
import assert from "node:assert";
import net from "net";
import tls from "tls";
import {
  createSafeChainProxy,
  mergeSafeChainProxyEnvironmentVariables,
} from "./registryProxy.js";
import { getCaCertPath } from "./certUtils.js";
import { setEcoSystem, ECOSYSTEM_JS, ECOSYSTEM_PY } from "../config/settings.js";
import fs from "fs";

describe("registryProxy.mitm", () => {
  let proxy, proxyHost, proxyPort;

  before(async () => {
    proxy = createSafeChainProxy();
    await proxy.startServer();
    const envVars = mergeSafeChainProxyEnvironmentVariables([]);
    const proxyUrl = new URL(envVars.HTTPS_PROXY);
    proxyHost = proxyUrl.hostname;
    proxyPort = parseInt(proxyUrl.port, 10);
    // Default to JS ecosystem for JS registry tests
    setEcoSystem(ECOSYSTEM_JS);
  });

  after(async () => {
    await proxy.stopServer();
  });

  it("should intercept HTTPS requests to npm registry", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash"
    );

    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.body.includes("lodash"));
  });

  it("should allow non-malicious package downloads", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash/-/lodash-4.17.21.tgz"
    );

    // Should get a response (200 or redirect, but not 403 blocked)
    assert.notStrictEqual(response.statusCode, 403);
  });

  it("should handle 404 responses correctly", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/this-package-definitely-does-not-exist-12345"
    );

    assert.strictEqual(response.statusCode, 404);
  });

  it("should handle query parameters in URL", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash?write=true"
    );

    assert.strictEqual(response.statusCode, 200);
  });

  it("should generate valid certificates for yarn registry", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.yarnpkg.com",
      "/lodash"
    );

    assert.strictEqual(response.statusCode, 200);
  });

  it("should generate certificate with correct hostname in CN", async () => {
    const { cert } = await makeRegistryRequestAndGetCert(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash"
    );

    // Check certificate common name matches the target hostname
    assert.strictEqual(cert.subject.CN, "registry.npmjs.org");

    // Check Subject Alternative Name includes the hostname
    const san = cert.subjectaltname;
    assert.ok(san.includes("registry.npmjs.org"));

    // Check certificate is issued by safe-chain CA
    assert.strictEqual(cert.issuer.CN, "safe-chain proxy");
  });

  it("should generate different certificates for different hostnames", async () => {
    const { cert: cert1 } = await makeRegistryRequestAndGetCert(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash"
    );

    const { cert: cert2 } = await makeRegistryRequestAndGetCert(
      proxyHost,
      proxyPort,
      "registry.yarnpkg.com",
      "/lodash"
    );

    // Different hostnames should have different certificates
    assert.notStrictEqual(cert1.fingerprint, cert2.fingerprint);
    assert.strictEqual(cert1.subject.CN, "registry.npmjs.org");
    assert.strictEqual(cert2.subject.CN, "registry.yarnpkg.com");
  });

  it("should cache generated certificates for same hostname", async () => {
    const { cert: cert1 } = await makeRegistryRequestAndGetCert(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash"
    );

    const { cert: cert2 } = await makeRegistryRequestAndGetCert(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/package/lodash"
    );

    // Same hostname should get the same certificate (fingerprint)
    assert.strictEqual(cert1.fingerprint, cert2.fingerprint);
  });

  // --- Pip registry MITM and env var tests ---
  it("should NOT set Python CA environment variables in proxy merge (handled by runPipCommand)", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables([]);
    assert.strictEqual(envVars.PIP_CERT, undefined);
    assert.strictEqual(envVars.REQUESTS_CA_BUNDLE, undefined);
    assert.strictEqual(envVars.SSL_CERT_FILE, undefined);
  });

  it("should intercept HTTPS requests to pypi.org for pip package", async () => {
    // Switch to Python ecosystem for pip registry MITM tests
    setEcoSystem(ECOSYSTEM_PY);
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "pypi.org",
      "/packages/source/f/foo_bar/foo_bar-2.0.0.tar.gz"
    );
    assert.notStrictEqual(response.statusCode, 403);
    assert.ok(typeof response.body === "string");
  });

  it("should intercept HTTPS requests to files.pythonhosted.org for pip wheel", async () => {
    // Ensure Python ecosystem
    setEcoSystem(ECOSYSTEM_PY);
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "files.pythonhosted.org",
      "/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl"
    );
    assert.notStrictEqual(response.statusCode, 403);
    assert.ok(typeof response.body === "string");
  });

  it("should handle pip package with a1 version", async () => {
    // Ensure Python ecosystem
    setEcoSystem(ECOSYSTEM_PY);
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "pypi.org",
      "/packages/source/f/foo_bar/foo_bar-2.0.0a1.tar.gz"
    );
    assert.notStrictEqual(response.statusCode, 403);
    assert.ok(typeof response.body === "string");
  });

  it("should handle pip package with latest version (should not block)", async () => {
    // Ensure Python ecosystem
    setEcoSystem(ECOSYSTEM_PY);
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "pypi.org",
      "/packages/source/f/foo_bar/foo_bar-latest.tar.gz"
    );
    assert.notStrictEqual(response.statusCode, 403);
    assert.ok(typeof response.body === "string");
  });
});

async function makeRegistryRequest(proxyHost, proxyPort, targetHost, path) {
  // Step 1: Connect to proxy
  const socket = await new Promise((resolve, reject) => {
    const sock = net.connect({ host: proxyHost, port: proxyPort }, () => {
      resolve(sock);
    });
    sock.on("error", reject);
  });

  // Step 2: Send CONNECT request
  await new Promise((resolve) => {
    const connectRequest = `CONNECT ${targetHost}:443 HTTP/1.1\r\nHost: ${targetHost}:443\r\n\r\n`;
    socket.write(connectRequest);
    socket.once("data", resolve);
  });

  // Step 3: Upgrade to TLS using the proxy's CA cert
  const tlsSocket = tls.connect({
    socket: socket,
    servername: targetHost,
    ca: fs.readFileSync(getCaCertPath()),
    rejectUnauthorized: true,
  });

  await new Promise((resolve) => {
    tlsSocket.on("secureConnect", resolve);
  });

  // Step 4: Send HTTP request over TLS
  const httpRequest = `GET ${path} HTTP/1.1\r\nHost: ${targetHost}\r\nConnection: close\r\n\r\n`;
  tlsSocket.write(httpRequest);

  // Step 5: Read response
  return new Promise((resolve, reject) => {
    let data = "";

    tlsSocket.on("data", (chunk) => {
      data += chunk.toString();
    });

    tlsSocket.on("end", () => {
      const lines = data.split("\r\n");
      const statusLine = lines[0];
      const statusCode = parseInt(statusLine.split(" ")[1]);

      // Find body after empty line
      const emptyLineIndex = lines.findIndex(line => line === "");
      const body = lines.slice(emptyLineIndex + 1).join("\r\n");

      resolve({ statusCode, body });
    });

    tlsSocket.on("error", reject);
  });
}

async function makeRegistryRequestAndGetCert(proxyHost, proxyPort, targetHost, path) {
  // Step 1: Connect to proxy
  const socket = await new Promise((resolve, reject) => {
    const sock = net.connect({ host: proxyHost, port: proxyPort }, () => {
      resolve(sock);
    });
    sock.on("error", reject);
  });

  // Step 2: Send CONNECT request
  await new Promise((resolve) => {
    const connectRequest = `CONNECT ${targetHost}:443 HTTP/1.1\r\nHost: ${targetHost}:443\r\n\r\n`;
    socket.write(connectRequest);
    socket.once("data", resolve);
  });

  // Step 3: Upgrade to TLS and capture certificate
  const tlsSocket = tls.connect({
    socket: socket,
    servername: targetHost,
    ca: fs.readFileSync(getCaCertPath()),
    rejectUnauthorized: true,
  });

  let peerCert;
  await new Promise((resolve) => {
    tlsSocket.on("secureConnect", () => {
      peerCert = tlsSocket.getPeerCertificate();
      resolve();
    });
  });

  // Step 4: Send HTTP request over TLS
  const httpRequest = `GET ${path} HTTP/1.1\r\nHost: ${targetHost}\r\nConnection: close\r\n\r\n`;
  tlsSocket.write(httpRequest);

  // Step 5: Read response
  const response = await new Promise((resolve, reject) => {
    let data = "";

    tlsSocket.on("data", (chunk) => {
      data += chunk.toString();
    });

    tlsSocket.on("end", () => {
      const lines = data.split("\r\n");
      const statusLine = lines[0];
      const statusCode = parseInt(statusLine.split(" ")[1]);

      // Find body after empty line
      const emptyLineIndex = lines.findIndex(line => line === "");
      const body = lines.slice(emptyLineIndex + 1).join("\r\n");

      resolve({ statusCode, body });
    });

    tlsSocket.on("error", reject);
  });

  return { cert: peerCert, response };
}
