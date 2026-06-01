import { describe, it, mock } from "node:test";
import assert from "node:assert";
import zlib from "node:zlib";

describe("mitmRequestHandler", async () => {
  let capturedHandler;
  let capturedOptions;

  mock.module("https", {
    defaultExport: {
      createServer: (_options, handler) => {
        capturedHandler = handler;
        return {
          on: () => {},
          emit: () => {},
        };
      },
      request: (options, callback) => {
        capturedOptions = options;

        const listeners = {};
        const proxyRes = {
          statusCode: 200,
          headers: {
            "content-encoding": "gzip",
            "content-length": "999",
            "transfer-encoding": "chunked",
          },
          on: (event, handler) => {
            listeners[event] = handler;
          },
        };

        callback(proxyRes);

        return {
          on: () => {},
          write: () => {},
          end: () => {
            const payload = Buffer.from("rewritten body");
            listeners["data"]?.(zlib.gzipSync(payload));
            listeners["end"]?.();
          },
          destroy: () => {},
        };
      },
    },
  });

  mock.module("./certUtils.js", {
    namedExports: {
      generateCertForHost: () => ({
        privateKey: "key",
        certificate: "cert",
      }),
    },
  });

  mock.module("https-proxy-agent", {
    namedExports: {
      HttpsProxyAgent: class {},
    },
  });

  mock.module("../environment/userInteraction.js", {
    namedExports: {
      ui: {
        writeVerbose: () => {},
        writeError: () => {},
      },
    },
  });

  const { mitmConnect } = await import("./mitmRequestHandler.js");

  it("sets content-length from the final compressed payload after body rewrite", async () => {
    const interceptor = {
      handleRequest: async () => ({
        blockResponse: undefined,
        modifyRequestHeaders: (headers) => headers,
        modifiesResponse: () => true,
        modifyBody: () => Buffer.from("rewritten body"),
      }),
    };

    const req = {
      url: "pypi.org:443",
    };

    const clientSocket = {
      on: () => {},
      write: () => {},
      headersSent: false,
      writable: true,
      end: () => {},
    };

    mitmConnect(req, clientSocket, interceptor);

    const resState = {
      statusCode: undefined,
      headers: undefined,
      body: undefined,
    };

    const res = {
      headersSent: false,
      writeHead: (statusCode, headers) => {
        resState.statusCode = statusCode;
        resState.headers = headers;
      },
      end: (body) => {
        resState.body = body;
      },
    };

    const request = {
      url: "/simple/example/",
      headers: {},
      method: "GET",
      on: (event, handler) => {
        if (event === "end") {
          handler();
        }
      },
    };

    await capturedHandler(request, res);

    assert.equal(capturedOptions.hostname, "pypi.org");
    assert.equal(resState.statusCode, 200);
    assert.equal(resState.headers["transfer-encoding"], undefined);
    assert.equal(
      resState.headers["content-length"],
      String(resState.body.byteLength)
    );
  });

  it("forwards the upstream response verbatim when the interceptor leaves the body unchanged", async () => {
    const interceptor = {
      handleRequest: async () => ({
        blockResponse: undefined,
        modifyRequestHeaders: (headers) => headers,
        modifiesResponse: () => true,
        // Return the same buffer reference we were given (no modification).
        modifyBody: (body) => body,
      }),
    };

    const req = {
      url: "registry.npmjs.org:443",
    };

    const clientSocket = {
      on: () => {},
      write: () => {},
      headersSent: false,
      writable: true,
      end: () => {},
    };

    mitmConnect(req, clientSocket, interceptor);

    const resState = {
      statusCode: undefined,
      headers: undefined,
      body: undefined,
    };

    const res = {
      headersSent: false,
      writeHead: (statusCode, headers) => {
        resState.statusCode = statusCode;
        resState.headers = headers;
      },
      end: (body) => {
        resState.body = body;
      },
    };

    const request = {
      url: "/lodash",
      headers: {},
      method: "GET",
      on: (event, handler) => {
        if (event === "end") {
          handler();
        }
      },
    };

    await capturedHandler(request, res);

    // Caching/encoding headers are preserved so npm and the registry can keep
    // serving the response from cache instead of re-reading on the next install.
    assert.equal(resState.statusCode, 200);
    assert.equal(resState.headers["content-encoding"], "gzip");
    assert.equal(resState.headers["content-length"], "999");
    assert.equal(resState.headers["transfer-encoding"], "chunked");
    // The body is forwarded still-compressed, exactly as received from upstream.
    assert.deepEqual(resState.body, zlib.gzipSync(Buffer.from("rewritten body")));
  });
});
