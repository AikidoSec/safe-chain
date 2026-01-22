import { before, after, describe, it } from "node:test";
import assert from "node:assert";
import net from "net";
import tls from "tls";
import { gunzipSync } from "zlib";
import {
  createSafeChainProxy,
  mergeSafeChainProxyEnvironmentVariables,
} from "./registryProxy.js";
import { getCaCertPath } from "./certUtils.js";
import {
  setEcoSystem,
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
} from "../config/settings.js";
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
      "/lodash",
    );

    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.body.includes("lodash"));
  });

  it("should allow non-malicious package downloads", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash/-/lodash-4.17.21.tgz",
    );

    // Should get a response (200 or redirect, but not 403 blocked)
    assert.notStrictEqual(response.statusCode, 403);
  });

  it("should handle 404 responses correctly", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/this-package-definitely-does-not-exist-12345",
    );

    assert.strictEqual(response.statusCode, 404);
  });

  it("should handle query parameters in URL", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash?write=true",
    );

    assert.strictEqual(response.statusCode, 200);
  });

  it("should generate valid certificates for yarn registry", async () => {
    const response = await makeRegistryRequest(
      proxyHost,
      proxyPort,
      "registry.yarnpkg.com",
      "/lodash",
    );

    assert.strictEqual(response.statusCode, 200);
  });

  it("should generate certificate with correct hostname in CN", async () => {
    const { cert } = await makeRegistryRequestAndGetCert(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/lodash",
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
      "/lodash",
    );

    const { cert: cert2 } = await makeRegistryRequestAndGetCert(
      proxyHost,
      proxyPort,
      "registry.yarnpkg.com",
      "/lodash",
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
      "/lodash",
    );

    const { cert: cert2 } = await makeRegistryRequestAndGetCert(
      proxyHost,
      proxyPort,
      "registry.npmjs.org",
      "/package/lodash",
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
      "/packages/source/f/foo_bar/foo_bar-2.0.0.tar.gz",
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
      "/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl",
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
      "/packages/source/f/foo_bar/foo_bar-2.0.0a1.tar.gz",
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
      "/packages/source/f/foo_bar/foo_bar-latest.tar.gz",
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
  const httpRequest = `GET ${path} HTTP/1.1\r\nHost: ${targetHost}\r\nConnection: close\r\nAccept-encoding: gzip\r\n\r\n`;
  tlsSocket.write(httpRequest);

  // Step 5: Read response as binary chunks
  return new Promise((resolve, reject) => {
    const chunks = [];

    tlsSocket.on("data", (chunk) => {
      chunks.push(chunk);
    });

    tlsSocket.on("end", () => {
      const buffer = Buffer.concat(chunks);

      // Find the header/body separator (\r\n\r\n) in binary
      const separator = Buffer.from("\r\n\r\n");
      let separatorIndex = buffer.indexOf(separator);
      if (separatorIndex === -1) {
        return reject(
          new Error("Invalid HTTP response: no header/body separator"),
        );
      }

      // Extract headers as text
      const headersText = buffer.subarray(0, separatorIndex).toString("utf8");
      const headerLines = headersText.split("\r\n");
      const statusLine = headerLines[0];
      const statusCode = parseInt(statusLine.split(" ")[1]);

      // Parse headers into object
      const headers = {};
      for (let i = 1; i < headerLines.length; i++) {
        const colonIndex = headerLines[i].indexOf(":");
        if (colonIndex > 0) {
          const key = headerLines[i].substring(0, colonIndex).toLowerCase();
          const value = headerLines[i].substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      }

      // Extract body as binary
      let bodyBuffer = buffer.subarray(separatorIndex + separator.length);

      // Decode chunked transfer encoding if present
      if (headers["transfer-encoding"] === "chunked") {
        bodyBuffer = decodeChunked(bodyBuffer);
      }

      // Decompress if gzip encoded
      if (headers["content-encoding"] === "gzip" && bodyBuffer.length > 0) {
        bodyBuffer = gunzipSync(bodyBuffer);
      }

      const body = bodyBuffer.toString("utf8");
      resolve({ statusCode, body, headers });
    });

    tlsSocket.on("error", reject);
  });
}

async function makeRegistryRequestAndGetCert(
  proxyHost,
  proxyPort,
  targetHost,
  path,
) {
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
      const emptyLineIndex = lines.findIndex((line) => line === "");
      const body = lines.slice(emptyLineIndex + 1).join("\r\n");

      resolve({ statusCode, body });
    });

    tlsSocket.on("error", reject);
  });

  return { cert: peerCert, response };
}

/**
 * Decode HTTP chunked transfer encoding
 * Format: <chunk-size-hex>\r\n<chunk-data>\r\n ... 0\r\n\r\n
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function decodeChunked(buffer) {
  const chunks = [];
  let offset = 0;

  while (offset < buffer.length) {
    // Find the end of the chunk size line
    const lineEnd = buffer.indexOf(Buffer.from("\r\n"), offset);
    if (lineEnd === -1) break;

    // Parse chunk size (hex)
    const sizeHex = buffer.subarray(offset, lineEnd).toString("utf8");
    const chunkSize = parseInt(sizeHex, 16);

    // End of chunks
    if (chunkSize === 0) break;

    // Extract chunk data
    const dataStart = lineEnd + 2;
    const dataEnd = dataStart + chunkSize;
    chunks.push(buffer.subarray(dataStart, dataEnd));

    // Move past chunk data and trailing \r\n
    offset = dataEnd + 2;
  }

  return Buffer.concat(chunks);
}
