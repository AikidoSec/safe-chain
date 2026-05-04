import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert";
import EventEmitter from "node:events";

// --- Mock setup ---

const mockReportingServer = Object.assign(new EventEmitter(), {
  start: mock.fn(async () => {}),
  stop: mock.fn(async () => {}),
  getAddress: mock.fn(() => "http://127.0.0.1:9999"),
});

mock.module("./reportingServer.js", {
  namedExports: {
    getReportingServer: () => mockReportingServer,
  },
});

const mockKill = mock.fn();
mock.module("node:child_process", {
  namedExports: {
    spawn: mock.fn(() => ({ kill: mockKill })),
  },
});

const mockExistsSync = mock.fn(() => true);
const mockMkdtempSync = mock.fn(() => "/tmp/safe-chain-proxy-abc");
const mockReadFile = mock.fn(
  (/** @type {string} */ path, /** @type {string} */ _encoding, /** @type {Function} */ cb) => {
    if (path.endsWith("proxy.addr.txt")) {
      cb(null, "127.0.0.1:8080");
    } else if (path.endsWith("meta.addr.txt")) {
      cb(null, "127.0.0.1:8081");
    } else {
      cb(new Error("unknown file"));
    }
  },
);

mock.module("node:fs", {
  namedExports: {
    existsSync: mockExistsSync,
    mkdtempSync: mockMkdtempSync,
    readFile: mockReadFile,
  },
});

mock.module("../../environment/userInteraction.js", {
  namedExports: { ui: { writeVerbose: mock.fn() } },
});

mock.module("../../config/settings.js", {
  namedExports: {
    getLoggingLevel: mock.fn(() => "default"),
    LOGGING_VERBOSE: "verbose",
  },
});

const mockFetch = mock.method(globalThis, "fetch", async () => ({
  text: async () => "MOCK_CA_CERT_PEM",
}));

const { getRamaPath, createRamaProxy } = await import(
  "./createRamaProxy.js"
);

describe("getRamaPath", () => {
  it("returns path ending in safechain-proxy when existsSync returns true", () => {
    mockExistsSync.mock.resetCalls();
    mockExistsSync.mock.mockImplementation(() => true);

    const result = getRamaPath();
    assert.ok(result?.endsWith("safechain-proxy"), `Expected path ending in safechain-proxy, got ${result}`);
  });

  it("returns null when existsSync returns false", () => {
    mockExistsSync.mock.mockImplementation(() => false);

    const result = getRamaPath();
    assert.strictEqual(result, null);

    // Restore for other tests
    mockExistsSync.mock.mockImplementation(() => true);
  });
});

describe("createRamaProxy — before startServer", () => {
  /** @type {ReturnType<typeof createRamaProxy>} */
  let proxy;

  before(() => {
    proxy = createRamaProxy("/fake/path/safechain-proxy");
  });

  it("getServerPort() returns null", () => {
    assert.strictEqual(proxy.getServerPort(), null);
  });

  it("getCaCert() returns null", () => {
    assert.strictEqual(proxy.getCaCert(), null);
  });

  it("hasSuppressedVersions() returns false", () => {
    assert.strictEqual(proxy.hasSuppressedVersions(), false);
  });
});

describe("createRamaProxy — after startServer", () => {
  /** @type {ReturnType<typeof createRamaProxy>} */
  let proxy;

  before(async () => {
    mockReportingServer.start.mock.resetCalls();
    mockReportingServer.stop.mock.resetCalls();
    mockKill.mock.resetCalls();
    mockFetch.mock.resetCalls();

    proxy = createRamaProxy("/fake/path/safechain-proxy");
    await proxy.startServer();
  });

  after(async () => {
    await proxy.stopServer();
  });

  it("transforms blockReceived into malwareBlocked event", async () => {
    const eventPromise = new Promise((resolve) => {
      proxy.once("malwareBlocked", resolve);
    });

    mockReportingServer.emit("blockReceived", {
      ts_ms: Date.now(),
      artifact: {
        product: "npm",
        identifier: "evil-pkg",
        version: "2.0.0",
      },
    });

    const received = await eventPromise;
    assert.deepStrictEqual(received, {
      packageName: "evil-pkg",
      packageVersion: "2.0.0",
    });
  });

  it("getServerPort() returns the correct port", () => {
    assert.strictEqual(proxy.getServerPort(), 8080);
  });

  it("getCaCert() returns the mocked certificate", () => {
    assert.strictEqual(proxy.getCaCert(), "MOCK_CA_CERT_PEM");
  });
});

describe("createRamaProxy — stopServer", () => {
  it("calls kill on spawned process and stop on reporting server", async () => {
    mockReportingServer.start.mock.resetCalls();
    mockReportingServer.stop.mock.resetCalls();
    mockKill.mock.resetCalls();

    const proxy = createRamaProxy("/fake/path/safechain-proxy");
    await proxy.startServer();
    await proxy.stopServer();

    assert.strictEqual(mockKill.mock.callCount(), 1);
    assert.strictEqual(mockReportingServer.stop.mock.callCount(), 1);
  });

  it("is safe to call when server was never started", async () => {
    mockReportingServer.stop.mock.resetCalls();

    const proxy = createRamaProxy("/fake/path/safechain-proxy");
    // Should not throw
    await proxy.stopServer();
  });
});
