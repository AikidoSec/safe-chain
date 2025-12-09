import { before, after, describe, it, mock } from "node:test";
import assert from "node:assert";
import net from "net";
import tls from "tls";

// Mock isImdsEndpoint BEFORE any other imports that might use it
// This allows us to use TEST-NET-1 (192.0.2.1) as a test IMDS endpoint
const mockIsImdsEndpoint = (host) => {
  if (host === "192.0.2.1") return true;
  return [
    "metadata.google.internal",
    "metadata.goog",
    "169.254.169.254",
  ].includes(host);
};

mock.module("./isImdsEndpoint.js", {
  namedExports: {
    isImdsEndpoint: mockIsImdsEndpoint,
  },
});

// Mock getConnectTimeout to speed up tests
mock.module("./getConnectTimeout.js", {
  namedExports: {
    getConnectTimeout: (host) => {
      // IMDS endpoints: 100ms (real: 3s)
      // Other endpoints: 500ms (real: 30s)
      return mockIsImdsEndpoint(host) ? 100 : 500;
    },
  },
});

// Use dynamic import AFTER mocking to ensure mock is applied
const { createSafeChainProxy, mergeSafeChainProxyEnvironmentVariables } =
  await import("./registryProxy.js");

describe("registryProxy.connectTunnel", () => {
  let proxy, proxyHost, proxyPort;

  before(async () => {
    proxy = createSafeChainProxy();
    await proxy.startServer();
    const envVars = mergeSafeChainProxyEnvironmentVariables([]);
    const proxyUrl = new URL(envVars.HTTPS_PROXY);
    proxyHost = proxyUrl.hostname;
    proxyPort = parseInt(proxyUrl.port, 10);
  });

  after(async () => {
    await proxy.stopServer();
  });

  it("should establish a tunnel for HTTP connect", async () => {
    const socket = await connectToProxy(proxyHost, proxyPort);
    const tunnelResponse = await establishHttpsTunnel(
      socket,
      "postman-echo.com",
      443
    );

    assert.ok(tunnelResponse.includes("HTTP/1.1 200 Connection Established"));
    socket.destroy();
  });

  it("should send HTTPS request through the established tunnel", async () => {
    const socket = await connectToProxy(proxyHost, proxyPort);
    await establishHttpsTunnel(socket, "postman-echo.com", 443);
    const httpsResponse = await sendHttpsRequestThroughTunnel(
      socket,
      "GET",
      new URL("https://postman-echo.com/status/200")
    );

    assert.ok(httpsResponse.includes("HTTP/1.1 200 OK"));

    socket.destroy();
  });

  it("should use destination's real certificate (not safe-chain's self-signed CA)", async () => {
    const socket = await connectToProxy(proxyHost, proxyPort);
    await establishHttpsTunnel(socket, "postman-echo.com", 443);

    // Verifies that tunnel requests pass through the destination's real certificate
    // without interception by the safe-chain MITM proxy.
    const certInfo = await getTlsCertificateInfo(
      socket,
      new URL("https://postman-echo.com")
    );

    // Verify the certificate is NOT issued by our safe-chain CA
    // Our self-signed CA would have issuer: "Safe-Chain Proxy CA"
    assert.ok(
      certInfo.issuer !== undefined,
      "Certificate should have an issuer"
    );
    assert.ok(
      !certInfo.issuer.includes("Safe-Chain"),
      `Tunnel should use destination's real certificate, not safe-chain CA. Issuer: ${certInfo.issuer}`
    );

    // Verify it's a real certificate with proper hostname
    assert.strictEqual(
      certInfo.subject.includes("postman-echo.com"),
      true,
      `Certificate subject should include postman-echo.com, got: ${certInfo.subject}`
    );

    socket.destroy();
  });

  describe("Error Handling", () => {
    it("should return 502 Bad Gateway for invalid hostname", async () => {
      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT invalid.hostname.that.does.not.exist:443 HTTP/1.1\r\nHost: invalid.hostname.that.does.not.exist:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      assert.ok(responseData.includes("HTTP/1.1 502 Bad Gateway"));
      socket.destroy();
    });

    it("should handle client disconnect during tunnel establishment", async () => {
      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT postman-echo.com:443 HTTP/1.1\r\nHost: postman-echo.com:443\r\n\r\n`;
      socket.write(connectRequest);

      // Immediately destroy the socket before tunnel is fully established
      socket.destroy();

      // If no crash occurs, the test passes
      assert.ok(true);
    });

    it("should handle socket errors without crashing", async () => {
      const socket = await connectToProxy(proxyHost, proxyPort);

      socket.on("error", () => {
        // Error handler is set to prevent crashes
      });

      const connectRequest = `CONNECT postman-echo.com:443 HTTP/1.1\r\nHost: postman-echo.com:443\r\n\r\n`;
      socket.write(connectRequest);

      // Force an error by destroying the socket
      socket.destroy();

      // Wait a bit to ensure error handling completes
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Test passes if no unhandled error crashes the process
      assert.ok(true);
    });
  });

  describe("Connection Timeout", () => {
    it("should timeout quickly when connecting to IMDS endpoint", async () => {
      // We need to make sure we're not running behind an existing safe-chain installation to allow this test to work
      const https_proxy = process.env.HTTPS_PROXY;
      delete process.env.HTTPS_PROXY;
      const socket = await connectToProxy(proxyHost, proxyPort);
      const startTime = Date.now();

      // 192.0.2.1 is TEST-NET-1 (RFC 5737), guaranteed to never route
      const connectRequest = `CONNECT 192.0.2.1:443 HTTP/1.1\r\nHost: 192.0.2.1:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      const duration = Date.now() - startTime;

      // Should return 502 Bad Gateway
      assert.ok(
        responseData.includes("HTTP/1.1 502 Bad Gateway"),
        "Should return 502 for timeout"
      );

      // Should timeout around 3 seconds for IMDS endpoints (allow some margin)
      assert.ok(
        duration >= 80 && duration < 200,
        `IMDS timeout should be ~80-200ms, got ${duration}ms`
      );

      socket.destroy();
      if (https_proxy) {
        process.env.HTTPS_PROXY = https_proxy;
      }
    });

    it("should cache timed-out IMDS endpoints and fail immediately on retry", async () => {
      // We need to make sure we're not running behind an existing safe-chain installation to allow this test to work
      const https_proxy = process.env.HTTPS_PROXY;
      delete process.env.HTTPS_PROXY;
      // First connection - will timeout (192.0.2.1 is mocked as IMDS endpoint)
      const socket1 = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT 192.0.2.1:80 HTTP/1.1\r\nHost: 192.0.2.1:80\r\n\r\n`;
      socket1.write(connectRequest);

      await new Promise((resolve) => {
        socket1.once("data", () => resolve());
      });
      socket1.destroy();

      // Second connection - should fail immediately (cached)
      const socket2 = await connectToProxy(proxyHost, proxyPort);
      const startTime = Date.now();
      socket2.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket2.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      const duration = Date.now() - startTime;

      // Should return 502 immediately (cached timeout)
      assert.ok(
        responseData.includes("HTTP/1.1 502 Bad Gateway"),
        "Should return 502 for cached timeout"
      );

      // Should be nearly instant (< 50ms) since it's cached
      assert.ok(
        duration < 50,
        `Cached IMDS timeout should be instant, got ${duration}ms`
      );

      socket2.destroy();
      if (https_proxy) {
        process.env.HTTPS_PROXY = https_proxy;
      }
    });

    it("should NOT cache timed-out non-IMDS endpoints", async () => {
      // We need to make sure we're not running behind an existing safe-chain installation to allow this test to work
      const https_proxy = process.env.HTTPS_PROXY;
      delete process.env.HTTPS_PROXY;

      // 192.0.2.2 is in TEST-NET-1 (RFC 5737) but NOT mocked as IMDS
      // It will timeout but should NOT be cached
      const connectRequest = `CONNECT 192.0.2.2:443 HTTP/1.1\r\nHost: 192.0.2.2:443\r\n\r\n`;

      // First connection - will timeout
      const socket1 = await connectToProxy(proxyHost, proxyPort);
      socket1.write(connectRequest);

      await new Promise((resolve) => {
        socket1.once("data", () => resolve());
      });
      socket1.destroy();

      // Second connection - should NOT fail immediately because non-IMDS endpoints are not cached
      const socket2 = await connectToProxy(proxyHost, proxyPort);
      const startTime = Date.now();
      socket2.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket2.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      const duration = Date.now() - startTime;

      // Should return 502 Bad Gateway (timeout)
      assert.ok(
        responseData.includes("HTTP/1.1 502 Bad Gateway"),
        "Should return 502 for timeout"
      );

      // Should NOT be instant - it should retry the connection (taking ~500ms due to mock timeout)
      // If it was cached, it would return in < 50ms
      assert.ok(
        duration >= 400,
        `Non-IMDS timeout should NOT be cached, but got instant response in ${duration}ms`
      );

      socket2.destroy();
      if (https_proxy) {
        process.env.HTTPS_PROXY = https_proxy;
      }
    });
  });
});

function connectToProxy(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      resolve(socket);
    });

    socket.on("error", (err) => {
      reject(err);
    });
  });
}

function establishHttpsTunnel(socket, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`;
    socket.write(connectRequest);

    let responseData = "";
    const onData = (data) => {
      responseData += data.toString();
      if (responseData.includes("\r\n\r\n")) {
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);
        resolve(responseData);
      }
    };

    const onError = (err) => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      reject(err);
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function sendHttpsRequestThroughTunnel(
  socket,
  verb,
  url,
  rejectUnauthorized = false
) {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect(
      {
        socket: socket,
        servername: url.hostname,
        // Tests should focus on tunnel behavior, not system CA state;
        // disable CA verification to avoid flakiness on machines without full roots.
        rejectUnauthorized: rejectUnauthorized,
      },
      () => {
        tlsSocket.write(
          `${verb} ${url.pathname} HTTP/1.1\r\nHost: ${url.hostname}\r\nConnection: close\r\n\r\n`
        );
      }
    );

    let tlsData = "";

    tlsSocket.on("data", (data) => {
      tlsData += data.toString();
    });

    tlsSocket.on("end", () => {
      resolve(tlsData);
    });

    tlsSocket.on("error", (err) => {
      reject(err);
    });
  });
}

function getTlsCertificateInfo(socket, url) {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect(
      {
        socket: socket,
        servername: url.hostname,
        // Don't reject unauthorized to avoid system CA issues in CI
        // We just want to inspect the certificate
        rejectUnauthorized: false,
      },
      () => {
        const cert = tlsSocket.getPeerCertificate();

        // Extract issuer and subject information
        const issuer = cert.issuer
          ? Object.entries(cert.issuer)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")
          : "unknown";
        const subject = cert.subject
          ? Object.entries(cert.subject)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")
          : "unknown";

        tlsSocket.end();
        resolve({ issuer, subject });
      }
    );

    tlsSocket.on("error", (err) => {
      reject(err);
    });
  });
}
