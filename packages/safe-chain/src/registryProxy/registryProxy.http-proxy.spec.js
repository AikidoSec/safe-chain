import { before, after, describe, it } from "node:test";
import assert from "node:assert";
import http from "http";
import {
  createSafeChainProxy,
  mergeSafeChainProxyEnvironmentVariables,
} from "./registryProxy.js";

describe("registryProxy.httpProxy", () => {
  let proxy, proxyHost, proxyPort;
  let testHttpServer, testHttpServerPort;

  before(async () => {
    // Start safe-chain proxy
    proxy = createSafeChainProxy();
    await proxy.startServer();
    const envVars = mergeSafeChainProxyEnvironmentVariables([]);
    const proxyUrl = new URL(envVars.HTTPS_PROXY);
    proxyHost = proxyUrl.hostname;
    proxyPort = parseInt(proxyUrl.port, 10);

    // Start a test HTTP server to forward requests to
    testHttpServer = http.createServer((req, res) => {
      if (req.url === "/test") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("HTTP test response");
      } else if (req.url === "/echo-headers") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(req.headers));
      } else if (req.url === "/echo-method") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(req.method);
      } else if (req.url === "/post-echo") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(body);
        });
      } else if (req.url === "/404") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      }
    });

    testHttpServerPort = await new Promise((resolve) => {
      testHttpServer.listen(0, () => {
        resolve(testHttpServer.address().port);
      });
    });
  });

  after(async () => {
    await proxy.stopServer();
    await new Promise((resolve) => {
      testHttpServer.close(() => resolve());
      setTimeout(resolve, 1000);
    });
  });

  it("should forward HTTP GET requests", async () => {
    const response = await makeHttpProxyRequest(
      proxyHost,
      proxyPort,
      `http://localhost:${testHttpServerPort}/test`,
      "GET"
    );

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.body, "HTTP test response");
  });

  it("should forward HTTP POST requests with body", async () => {
    const postData = "test post data";
    const response = await makeHttpProxyRequest(
      proxyHost,
      proxyPort,
      `http://localhost:${testHttpServerPort}/post-echo`,
      "POST",
      postData
    );

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.body, postData);
  });

  it("should preserve request headers", async () => {
    const response = await makeHttpProxyRequest(
      proxyHost,
      proxyPort,
      `http://localhost:${testHttpServerPort}/echo-headers`,
      "GET",
      null,
      {
        "X-Custom-Header": "test-value",
        "User-Agent": "test-agent/1.0",
      }
    );

    assert.strictEqual(response.statusCode, 200);
    const headers = JSON.parse(response.body);
    assert.strictEqual(headers["x-custom-header"], "test-value");
    assert.strictEqual(headers["user-agent"], "test-agent/1.0");
  });

  it("should preserve HTTP methods", async () => {
    const methods = ["GET", "POST", "PUT", "DELETE"];

    for (const method of methods) {
      const response = await makeHttpProxyRequest(
        proxyHost,
        proxyPort,
        `http://localhost:${testHttpServerPort}/echo-method`,
        method
      );

      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.body, method);
    }
  });

  it("should forward 404 responses correctly", async () => {
    const response = await makeHttpProxyRequest(
      proxyHost,
      proxyPort,
      `http://localhost:${testHttpServerPort}/404`,
      "GET"
    );

    assert.strictEqual(response.statusCode, 404);
    assert.strictEqual(response.body, "Not Found");
  });

  it("should handle invalid host with 502 Bad Gateway", async () => {
    const response = await makeHttpProxyRequest(
      proxyHost,
      proxyPort,
      "http://invalid-host-that-does-not-exist.test:9999/test",
      "GET"
    );

    assert.strictEqual(response.statusCode, 502);
    assert.ok(response.body.includes("Bad Gateway"));
  });

  it("should handle HTTPS URLs sent to HTTP proxy", async () => {
    // Some clients incorrectly send https:// URLs to the HTTP proxy handler
    // instead of using CONNECT. The proxy should handle this gracefully.
    const response = await makeHttpProxyRequest(
      proxyHost,
      proxyPort,
      "https://registry.npmjs.org/lodash",
      "GET"
    );

    // Should successfully forward the HTTPS request
    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.body.includes("lodash"));
  });

  it("should handle unsupported protocols with 502", async () => {
    const response = await makeHttpProxyRequest(
      proxyHost,
      proxyPort,
      "ftp://example.com/file.txt",
      "GET"
    );

    assert.strictEqual(response.statusCode, 502);
    assert.ok(response.body.includes("Unsupported protocol"));
  });
});

function makeHttpProxyRequest(
  proxyHost,
  proxyPort,
  targetUrl,
  method = "GET",
  body = null,
  extraHeaders = {}
) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: proxyHost,
      port: proxyPort,
      path: targetUrl,
      method: method,
      headers: {
        Host: new URL(targetUrl).host,
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
      reject(err);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}
