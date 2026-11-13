import { describe, it, mock } from "node:test";
import assert from "node:assert";
import zlib from "node:zlib";

describe("mitmRequestHandler", async () => {
  let capturedHandler;
  let capturedOptions;
  let resumed = false;
  let piped = false;

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
          resume: () => { resumed = true; },
          pipe: (res) => {
            piped = true;
            res.end(zlib.gzipSync(Buffer.from("rewritten body")));
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

  mock.module("./certBundle.js", {
    namedExports: {
      getCombinedCaCertificates: () => ["SYSTEM-STORE-CA-PEM"],
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
        checkResponseHeaders: () => undefined,
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
    // The upstream request must trust the combined CA store (Node roots +
    // certifi + OS system store + NODE_EXTRA_CA_CERTS) so OS-installed
    // self-signed registries validate instead of returning Bad Gateway (#270).
    assert.ok(Array.isArray(capturedOptions.ca), "upstream request passes a ca array");
    assert.ok(capturedOptions.ca.length > 0, "ca array is non-empty");
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
        checkResponseHeaders: (statusCode, headers) => {
          assert.equal(statusCode, 200);
          assert.equal(headers["content-encoding"], "gzip");
          return undefined;
        },
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

  for (const modifiesResponse of [false, true]) {
    it(`blocks upstream responses before the ${modifiesResponse ? "buffered" : "piped"} path`, async () => {
      resumed = false;
      piped = false;
      const message = "Forbidden - minimum package age";
      const interceptor = {
        handleRequest: async () => ({
          modifyRequestHeaders: (headers) => headers,
          checkResponseHeaders: (statusCode, headers) => {
            assert.equal(statusCode, 200);
            assert.equal(headers["content-encoding"], "gzip");
            return { statusCode: 403, message };
          },
          modifiesResponse: () => modifiesResponse,
          modifyBody: () => assert.fail("Blocked body must not be processed"),
        }),
      };
      mitmConnect({ url: "pypi.org:443" }, { on: () => {}, write: () => {} }, interceptor);
      const state = {};
      await capturedHandler({
        url: "/package.whl",
        headers: {},
        method: "GET",
        on: (event, handler) => { if (event === "end") handler(); },
      }, {
        writeHead: (statusCode, headers) => {
          state.statusCode = statusCode;
          state.headers = headers;
        },
        end: (body) => { state.body = body; },
      });

      assert.deepEqual(state, { statusCode: 403, headers: message, body: message });
      assert.equal(resumed, true);
      assert.equal(piped, false);
    });
  }

  it("forwards the upstream body unchanged on the piped path when the header check allows it", async () => {
    resumed = false;
    piped = false;
    const interceptor = {
      handleRequest: async () => ({
        modifyRequestHeaders: (headers) => headers,
        checkResponseHeaders: (statusCode, headers) => {
          assert.equal(statusCode, 200);
          assert.equal(headers["content-encoding"], "gzip");
          return undefined;
        },
        modifiesResponse: () => false,
      }),
    };
    mitmConnect({ url: "pypi.org:443" }, { on: () => {}, write: () => {} }, interceptor);
    const state = {};
    await capturedHandler({
      url: "/package.whl",
      headers: {},
      method: "GET",
      on: (event, handler) => { if (event === "end") handler(); },
    }, {
      writeHead: (statusCode, headers) => {
        state.statusCode = statusCode;
        state.headers = headers;
      },
      end: (body) => { state.body = body; },
    });

    assert.equal(state.statusCode, 200);
    assert.equal(state.headers["content-encoding"], "gzip");
    assert.deepEqual(state.body, zlib.gzipSync(Buffer.from("rewritten body")));
    assert.equal(resumed, false);
    assert.equal(piped, true);
  });
});
