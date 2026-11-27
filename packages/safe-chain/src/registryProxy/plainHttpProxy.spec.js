import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("plainHttpProxy ca option (#270)", async () => {
  const httpsStore = {};
  const httpStore = {};

  function makeRequestStub(store) {
    return (_url, options) => {
      store.options = options;
      return {
        on() {
          return this;
        },
        write() {},
        end() {},
        destroy() {},
      };
    };
  }

  mock.module("https", {
    namedExports: { request: makeRequestStub(httpsStore) },
    defaultExport: { request: makeRequestStub(httpsStore) },
  });

  mock.module("http", {
    namedExports: { request: makeRequestStub(httpStore) },
    defaultExport: { request: makeRequestStub(httpStore) },
  });

  mock.module("./certBundle.js", {
    namedExports: {
      getCombinedCaCertificates: () => ["SYSTEM-STORE-CA-PEM"],
    },
  });

  mock.module("../environment/userInteraction.js", {
    namedExports: {
      ui: { writeVerbose: () => {}, writeError: () => {}, writeWarning: () => {} },
    },
  });

  const { handleHttpProxyRequest } = await import("./plainHttpProxy.js");

  function makeReqRes(url) {
    const req = {
      url,
      method: "GET",
      headers: {},
      on() {},
      pipe() {},
    };
    const res = {
      headersSent: false,
      writable: true,
      writeHead() {},
      end() {},
      destroy() {},
      on() {},
    };
    return { req, res };
  }

  it("passes the combined ca array on the direct-HTTPS fallback", () => {
    httpsStore.options = undefined;
    const { req, res } = makeReqRes("https://app.local.test/pkg");
    handleHttpProxyRequest(req, res);

    assert.ok(httpsStore.options, "https.request was called");
    assert.deepStrictEqual(
      httpsStore.options.ca,
      ["SYSTEM-STORE-CA-PEM"],
      "https fallback trusts the combined CA store"
    );
  });

  it("does not set ca on the plain-HTTP path", () => {
    httpStore.options = undefined;
    const { req, res } = makeReqRes("http://example.test/pkg");
    handleHttpProxyRequest(req, res);

    assert.ok(httpStore.options, "http.request was called");
    assert.strictEqual(httpStore.options.ca, undefined, "plain HTTP has no ca option");
  });
});
