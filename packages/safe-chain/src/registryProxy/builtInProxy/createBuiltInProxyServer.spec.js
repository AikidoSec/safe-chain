import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert";
import EventEmitter from "events";

// Mock dependencies before importing the module under test
const mockMitmConnect = mock.fn();
const mockTunnelRequest = mock.fn();
const mockUi = { writeVerbose: mock.fn() };
const mockGetCaCertPath = mock.fn(() => "/fake/cert/path");
const mockGetHasSuppressedVersions = mock.fn(() => false);

/** @type {import("./interceptors/interceptorBuilder.js").Interceptor | undefined} */
let mockInterceptor;

mock.module("./mitmRequestHandler.js", {
  namedExports: { mitmConnect: mockMitmConnect },
});
mock.module("./tunnelRequestHandler.js", {
  namedExports: { tunnelRequest: mockTunnelRequest },
});
mock.module("./plainHttpProxy.js", {
  namedExports: { handleHttpProxyRequest: mock.fn() },
});
mock.module("../../environment/userInteraction.js", {
  namedExports: { ui: mockUi },
});
mock.module("./interceptors/createInterceptorForEcoSystem.js", {
  namedExports: {
    createInterceptorForUrl: mock.fn(() => mockInterceptor),
  },
});
mock.module("./interceptors/npm/modifyNpmInfo.js", {
  namedExports: { getHasSuppressedVersions: mockGetHasSuppressedVersions },
});
mock.module("./certUtils.js", {
  namedExports: { getCaCertPath: mockGetCaCertPath },
});

const { createBuiltInProxyServer } = await import(
  "./createBuiltInProxyServer.js"
);

describe("createBuiltInProxyServer event emission", () => {
  /** @type {ReturnType<typeof createBuiltInProxyServer>} */
  let proxy;

  before(async () => {
    proxy = createBuiltInProxyServer();
    await proxy.startServer();
  });

  after(async () => {
    await proxy.stopServer();
  });

  it("emits malwareBlocked when the interceptor fires a malwareBlocked event", async () => {
    // Create a real EventEmitter-based interceptor that we can trigger
    const interceptorEmitter = new EventEmitter();
    mockInterceptor = Object.assign(interceptorEmitter, {
      handleRequest: mock.fn(async () => ({
        blockResponse: { statusCode: 403, message: "blocked" },
        modifyRequestHeaders: (/** @type {any} */ h) => h,
        modifiesResponse: () => false,
        modifyBody: (/** @type {any} */ b) => b,
      })),
    });

    const eventPromise = new Promise((resolve) => {
      proxy.once("malwareBlocked", resolve);
    });

    // Trigger a CONNECT request to the proxy to wire up the interceptor
    const port = proxy.getServerPort();
    assert.ok(port, "Server should have a port");

    const net = await import("net");
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        "CONNECT registry.npmjs.org:443 HTTP/1.1\r\nHost: registry.npmjs.org:443\r\n\r\n",
      );
    });

    // Wait for the CONNECT handler to run and subscribe to the interceptor
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Now fire the malwareBlocked event on the interceptor
    interceptorEmitter.emit("malwareBlocked", {
      packageName: "evil-package",
      version: "1.0.0",
      targetUrl: "https://registry.npmjs.org/evil-package/-/evil-package-1.0.0.tgz",
      timestamp: Date.now(),
    });

    const received = await eventPromise;
    assert.deepStrictEqual(received, {
      packageName: "evil-package",
      packageVersion: "1.0.0",
    });

    socket.destroy();
  });

  it("does not emit malwareBlocked for non-intercepted hosts", async () => {
    // No interceptor for this URL
    mockInterceptor = undefined;

    let emitted = false;
    proxy.on("malwareBlocked", () => {
      emitted = true;
    });

    const port = proxy.getServerPort();
    const net = await import("net");
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n",
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(emitted, false, "Should not emit for non-intercepted hosts");

    socket.destroy();
  });
});
