import { describe, it, mock } from "node:test";
import assert from "node:assert";
import zlib from "node:zlib";

describe("mitmRequestHandler", async () => {
  let capturedHandler;
  let capturedOptions;
  let upstreamEncoding = "gzip";
  let upstreamBody = Buffer.from("rewritten body");

  const encoders = {
    gzip: zlib.gzipSync,
    br: zlib.brotliCompressSync,
    deflate: zlib.deflateSync,
    zstd: (buffer) => buffer,
  };

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
            "content-encoding": upstreamEncoding,
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
            listeners["data"]?.(encoders[upstreamEncoding](upstreamBody));
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

    let responseEnded;
    const ended = new Promise((resolve) => (responseEnded = resolve));
    const res = {
      headersSent: false,
      writeHead: (statusCode, headers) => {
        resState.statusCode = statusCode;
        resState.headers = headers;
      },
      end: (body) => {
        resState.body = body;
        responseEnded();
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
    await ended;

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

    let responseEnded;
    const ended = new Promise((resolve) => (responseEnded = resolve));
    const res = {
      headersSent: false,
      writeHead: (statusCode, headers) => {
        resState.statusCode = statusCode;
        resState.headers = headers;
      },
      end: (body) => {
        resState.body = body;
        responseEnded();
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
    await ended;

    // Caching/encoding headers are preserved so npm and the registry can keep
    // serving the response from cache instead of re-reading on the next install.
    assert.equal(resState.statusCode, 200);
    assert.equal(resState.headers["content-encoding"], "gzip");
    assert.equal(resState.headers["content-length"], "999");
    assert.equal(resState.headers["transfer-encoding"], "chunked");
    // The body is forwarded still-compressed, exactly as received from upstream.
    assert.deepEqual(resState.body, zlib.gzipSync(Buffer.from("rewritten body")));
  });

  /**
   * Runs one intercepted request whose upstream response uses `encoding`, and
   * returns the body the interceptor saw plus what was sent to the client.
   */
  async function interceptWithEncoding(encoding, modifyBody) {
    upstreamEncoding = encoding;
    upstreamBody = Buffer.from('{"name":"pkg"}');
    let seenByInterceptor;
    const interceptor = {
      handleRequest: async () => ({
        blockResponse: undefined,
        modifyRequestHeaders: (headers) => headers,
        modifiesResponse: () => true,
        modifyBody: (body) => {
          seenByInterceptor = body;
          return modifyBody(body);
        },
      }),
    };

    mitmConnect(
      { url: "registry.npmjs.org:443" },
      { on: () => {}, write: () => {}, writable: true, end: () => {} },
      interceptor
    );

    const sent = {};
    const ended = new Promise((resolve) => {
      const res = {
        headersSent: false,
        writeHead: (statusCode, headers) => {
          sent.headers = headers;
        },
        end: (body) => {
          sent.body = body;
          resolve();
        },
      };
      capturedHandler(
        {
          url: "/pkg",
          headers: {},
          method: "GET",
          on: (event, handler) => event === "end" && handler(),
        },
        res
      );
    });
    await ended;

    upstreamEncoding = "gzip";
    upstreamBody = Buffer.from("rewritten body");
    return { seenByInterceptor, sent };
  }

  for (const encoding of ["br", "deflate"]) {
    it(`decodes a ${encoding} response before the interceptor sees it`, async () => {
      const { seenByInterceptor, sent } = await interceptWithEncoding(
        encoding,
        () => Buffer.from('{"name":"rewritten"}')
      );

      assert.equal(seenByInterceptor.toString(), '{"name":"pkg"}');
      assert.equal(sent.headers["content-encoding"], undefined);
      assert.equal(sent.body.toString(), '{"name":"rewritten"}');
    });
  }

  it("forwards the response unmodified when its encoding is not supported", async () => {
    let interceptorCalled = false;
    const { sent } = await interceptWithEncoding("zstd", (body) => {
      interceptorCalled = true;
      return body;
    });

    assert.equal(interceptorCalled, false);
    assert.equal(sent.headers["content-encoding"], "zstd");
    assert.equal(sent.body.toString(), '{"name":"pkg"}');
  });

  it("only offers upstream the encodings it can decode when it may read the response", async () => {
    await interceptWithEncoding("gzip", (body) => body);

    assert.equal(capturedOptions.headers["accept-encoding"], "identity");
  });
});
