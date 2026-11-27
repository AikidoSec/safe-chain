import { before, after, describe, it, mock } from "node:test";
import assert from "node:assert";
import net from "net";
import http from "http";
import tls from "tls";
import {
  setEcoSystem,
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
} from "../config/settings.js";

// Mock isImdsEndpoint to allow localhost for testing
const mockIsImdsEndpoint = (host) => {
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

// Use dynamic import AFTER mocking
const { createSafeChainProxy, mergeSafeChainProxyEnvironmentVariables } =
  await import("./registryProxy.js");
const { isRecognizedRegistryUrl } = await import(
  "./interceptors/createInterceptorForEcoSystem.js"
);

describe("registryProxy.bypassPrevention", () => {
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

  describe("isRecognizedRegistryUrl function", () => {
    it("should recognize known npm registries for JS ecosystem", () => {
      setEcoSystem(ECOSYSTEM_JS);

      assert.strictEqual(
        isRecognizedRegistryUrl("https://registry.npmjs.org/lodash"),
        true,
        "Should recognize registry.npmjs.org"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("https://registry.yarnpkg.com/lodash"),
        true,
        "Should recognize registry.yarnpkg.com"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("https://registry.npmjs.com/lodash"),
        true,
        "Should recognize registry.npmjs.com"
      );
    });

    it("should recognize known pip registries for Python ecosystem", () => {
      setEcoSystem(ECOSYSTEM_PY);

      assert.strictEqual(
        isRecognizedRegistryUrl("https://pypi.org/simple/requests/"),
        true,
        "Should recognize pypi.org"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl(
          "https://files.pythonhosted.org/packages/foo/bar.whl"
        ),
        true,
        "Should recognize files.pythonhosted.org"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("https://pypi.python.org/simple/requests/"),
        true,
        "Should recognize pypi.python.org"
      );
    });

    it("should reject unrecognized registries for JS ecosystem", () => {
      setEcoSystem(ECOSYSTEM_JS);

      assert.strictEqual(
        isRecognizedRegistryUrl("https://evil-registry.com/malware"),
        false,
        "Should reject evil-registry.com"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("https://alternate-index.net/package"),
        false,
        "Should reject alternate-index.net"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("https://github.com/user/repo/archive.tar.gz"),
        false,
        "Should reject direct GitHub archive"
      );
    });

    it("should reject unrecognized registries for Python ecosystem", () => {
      setEcoSystem(ECOSYSTEM_PY);

      assert.strictEqual(
        isRecognizedRegistryUrl("https://evil-pypi.com/simple/malware/"),
        false,
        "Should reject evil-pypi.com"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("https://custom-mirror.net/packages/"),
        false,
        "Should reject custom-mirror.net"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("https://example.com/hosted/package.whl"),
        false,
        "Should reject externally hosted artifact"
      );
    });

    it("should allow localhost and loopback addresses", () => {
      setEcoSystem(ECOSYSTEM_JS);

      assert.strictEqual(
        isRecognizedRegistryUrl("http://localhost:4873/package"),
        true,
        "Should allow localhost"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("http://127.0.0.1:4873/package"),
        true,
        "Should allow 127.0.0.1"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("http://127.0.0.5:4873/package"),
        true,
        "Should allow 127.0.0.x"
      );
      // Note: IPv6 loopback (::1) support exists but URL parsing behavior varies by Node version
    });

    it("should handle CONNECT-style host:port format", () => {
      setEcoSystem(ECOSYSTEM_JS);

      // CONNECT requests use "host:port" format instead of full URLs
      assert.strictEqual(
        isRecognizedRegistryUrl("registry.npmjs.org:443"),
        true,
        "Should recognize registry.npmjs.org:443"
      );
      assert.strictEqual(
        isRecognizedRegistryUrl("evil-registry.com:443"),
        false,
        "Should reject evil-registry.com:443"
      );
    });

    it("should allow custom registries when configured", () => {
      setEcoSystem(ECOSYSTEM_JS);

      // Set custom registry via environment variable
      const originalEnv = process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
      process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES =
        "npm.company.com,registry.internal.net";

      // Re-import to pick up new env var
      // Note: In real tests, this would require module cache clearing or restart
      // For this test, we'll just verify the function behavior

      assert.strictEqual(
        isRecognizedRegistryUrl("https://npm.company.com/package"),
        true,
        "Should recognize custom registry npm.company.com"
      );

      // Restore original env
      if (originalEnv) {
        process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES = originalEnv;
      } else {
        delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
      }
    });
  });

  describe("HTTPS CONNECT bypass prevention", () => {
    it("should block CONNECT requests to unrecognized destinations for JS ecosystem", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT evil-registry.com:443 HTTP/1.1\r\nHost: evil-registry.com:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      assert.ok(
        responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should return 403 Forbidden for unrecognized destination"
      );
      assert.ok(
        responseData.includes("unrecognized package registry destination"),
        "Should include security message"
      );

      socket.destroy();
    });

    it("should block CONNECT requests to alternate index for Python ecosystem", async () => {
      setEcoSystem(ECOSYSTEM_PY);

      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT alternate-pypi-mirror.com:443 HTTP/1.1\r\nHost: alternate-pypi-mirror.com:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      assert.ok(
        responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should return 403 Forbidden for alternate index"
      );
      assert.ok(
        responseData.includes("unrecognized package registry destination"),
        "Should include security message"
      );

      socket.destroy();
    });

    it("should block CONNECT requests to direct VCS sources", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT github.com:443 HTTP/1.1\r\nHost: github.com:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      assert.ok(
        responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should return 403 Forbidden for VCS source"
      );

      socket.destroy();
    });

    it("should block CONNECT requests to externally hosted artifacts", async () => {
      setEcoSystem(ECOSYSTEM_PY);

      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      assert.ok(
        responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should return 403 Forbidden for external artifact host"
      );

      socket.destroy();
    });

    it("should allow CONNECT requests to recognized npm registry", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT registry.npmjs.org:443 HTTP/1.1\r\nHost: registry.npmjs.org:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      // Should get 200 Connection Established (MITM) or tunnel success, not 403
      assert.ok(
        !responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should NOT return 403 for recognized registry"
      );
      assert.ok(
        responseData.includes("HTTP/1.1 200") ||
          responseData.includes("Connection Established"),
        "Should establish connection for recognized registry"
      );

      socket.destroy();
    });

    it("should allow CONNECT requests to recognized pip registry", async () => {
      setEcoSystem(ECOSYSTEM_PY);

      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT files.pythonhosted.org:443 HTTP/1.1\r\nHost: files.pythonhosted.org:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      // Should get 200 Connection Established (MITM) or tunnel success, not 403
      assert.ok(
        !responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should NOT return 403 for recognized registry"
      );
      assert.ok(
        responseData.includes("HTTP/1.1 200") ||
          responseData.includes("Connection Established"),
        "Should establish connection for recognized registry"
      );

      socket.destroy();
    });
  });

  describe("Plain HTTP bypass prevention", () => {
    it("should block plain HTTP requests to unrecognized destinations for JS ecosystem", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      const response = await makeHttpProxyRequest(
        proxyHost,
        proxyPort,
        "http://evil-registry.com/malware-package.tgz",
        "GET"
      );

      assert.strictEqual(
        response.statusCode,
        403,
        "Should return 403 Forbidden for unrecognized destination"
      );
      assert.ok(
        response.body.includes("unrecognized package registry destination"),
        "Should include security message"
      );
    });

    it("should block plain HTTP requests to alternate mirrors for Python ecosystem", async () => {
      setEcoSystem(ECOSYSTEM_PY);

      const response = await makeHttpProxyRequest(
        proxyHost,
        proxyPort,
        "http://unconfigured-mirror.net/simple/malware/",
        "GET"
      );

      assert.strictEqual(
        response.statusCode,
        403,
        "Should return 403 Forbidden for unconfigured mirror"
      );
      assert.ok(
        response.body.includes("unrecognized package registry destination"),
        "Should include security message"
      );
    });

    it("should block plain HTTP requests to direct archive URLs", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      const response = await makeHttpProxyRequest(
        proxyHost,
        proxyPort,
        "http://example.com/packages/malicious-1.0.0.tar.gz",
        "GET"
      );

      assert.strictEqual(
        response.statusCode,
        403,
        "Should return 403 Forbidden for direct archive URL"
      );
    });

    it("should allow plain HTTP requests to localhost", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      // Create a local test server
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Local registry response");
      });

      const testPort = await new Promise((resolve) => {
        testServer.listen(0, () => {
          resolve(testServer.address().port);
        });
      });

      try {
        const response = await makeHttpProxyRequest(
          proxyHost,
          proxyPort,
          `http://localhost:${testPort}/package`,
          "GET"
        );

        assert.strictEqual(
          response.statusCode,
          200,
          "Should allow requests to localhost"
        );
        assert.strictEqual(
          response.body,
          "Local registry response",
          "Should forward request to localhost"
        );
      } finally {
        await new Promise((resolve) => {
          testServer.close(() => resolve());
        });
      }
    });
  });

  describe("Bypass scenarios from pentest", () => {
    it("should prevent bypass via alternate index (Step 2 scenario)", async () => {
      setEcoSystem(ECOSYSTEM_PY);

      // Attacker tries to use an alternate pip index that's not in the known list
      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT attacker-controlled-index.com:443 HTTP/1.1\r\nHost: attacker-controlled-index.com:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      assert.ok(
        responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should block alternate index that bypasses interceptor selection"
      );

      socket.destroy();
    });

    it("should prevent bypass via direct archive URL (Step 4 scenario)", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      // Attacker tries to install from a direct archive URL
      const response = await makeHttpProxyRequest(
        proxyHost,
        proxyPort,
        "http://attacker.com/malicious-package-1.0.0.tgz",
        "GET"
      );

      assert.strictEqual(
        response.statusCode,
        403,
        "Should block direct archive URL that bypasses package checks"
      );
    });

    it("should prevent bypass via VCS source (GitHub)", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      // Attacker tries to install from a VCS source
      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT github.com:443 HTTP/1.1\r\nHost: github.com:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      assert.ok(
        responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should block VCS source that bypasses malware checks"
      );

      socket.destroy();
    });

    it("should prevent bypass via unconfigured mirror", async () => {
      setEcoSystem(ECOSYSTEM_PY);

      // Attacker tries to use an unconfigured mirror
      const response = await makeHttpProxyRequest(
        proxyHost,
        proxyPort,
        "http://unconfigured-pypi-mirror.org/simple/package/",
        "GET"
      );

      assert.strictEqual(
        response.statusCode,
        403,
        "Should block unconfigured mirror that bypasses minimum-age checks"
      );
    });

    it("should prevent bypass via externally hosted artifact", async () => {
      setEcoSystem(ECOSYSTEM_PY);

      // Attacker hosts malicious package on their own server
      const socket = await connectToProxy(proxyHost, proxyPort);
      const connectRequest = `CONNECT attacker-hosting.com:443 HTTP/1.1\r\nHost: attacker-hosting.com:443\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
      });

      assert.ok(
        responseData.includes("HTTP/1.1 403 Forbidden"),
        "Should block externally hosted artifact that bypasses Safe Chain controls"
      );

      socket.destroy();
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle malformed URLs gracefully", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      const response = await makeHttpProxyRequest(
        proxyHost,
        proxyPort,
        "not-a-valid-url",
        "GET"
      );

      // Should return an error, not crash
      assert.ok(
        response.statusCode >= 400,
        "Should return error status for malformed URL"
      );
    });

    it("should handle CONNECT requests with missing host header", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      const socket = await connectToProxy(proxyHost, proxyPort);
      // Send CONNECT without Host header
      const connectRequest = `CONNECT evil-registry.com:443 HTTP/1.1\r\n\r\n`;
      socket.write(connectRequest);

      let responseData = "";
      await new Promise((resolve) => {
        socket.once("data", (data) => {
          responseData += data.toString();
          resolve();
        });
        // Add timeout in case no response
        setTimeout(resolve, 1000);
      });

      // Should still block unrecognized destination
      assert.ok(
        responseData.includes("403") || responseData.includes("400"),
        "Should return error for unrecognized destination even without Host header"
      );

      socket.destroy();
    });

    it("should provide helpful error message about custom registries", async () => {
      setEcoSystem(ECOSYSTEM_JS);

      const response = await makeHttpProxyRequest(
        proxyHost,
        proxyPort,
        "http://company-internal-registry.com/package",
        "GET"
      );

      assert.strictEqual(response.statusCode, 403);
      // The error message is in the response body
      assert.ok(
        response.body.includes("unrecognized package registry destination"),
        "Should mention unrecognized registry in error message"
      );
    });
  });
});

// Helper functions

function connectToProxy(proxyHost, proxyPort) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxyHost, () => {
      resolve(socket);
    });
    socket.on("error", reject);
  });
}

function makeHttpProxyRequest(
  proxyHost,
  proxyPort,
  targetUrl,
  method = "GET",
  body = null,
  extraHeaders = {}
) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (err) {
      // If URL parsing fails, still try to make the request
      // to test error handling
      parsedUrl = { host: "invalid" };
    }

    const options = {
      hostname: proxyHost,
      port: proxyPort,
      path: targetUrl,
      method: method,
      headers: {
        Host: parsedUrl.host,
        ...extraHeaders,
      },
    };

    const req = http.request(options, (res) => {
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += chunk.toString();
      });

      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody,
        });
      });
    });

    req.on("error", (err) => {
      // Don't reject on error, return error response instead
      resolve({
        statusCode: 0,
        headers: {},
        body: err.message,
      });
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}
