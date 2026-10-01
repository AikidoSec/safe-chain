import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runUvCommand", () => {
  let runUv;
  let capturedArgs = null;
  let warnings = [];
  let customEnv = {};
  let spawnResult = { status: 0 };
  let spawnError = null;

  beforeEach(async () => {
    capturedArgs = null;
    warnings = [];
    customEnv = {};
    spawnResult = { status: 0 };
    spawnError = null;

    mock.module("../../environment/userInteraction.js", {
      namedExports: {
        ui: {
          writeWarning: (msg) => warnings.push(msg),
          writeError: () => {},
          writeInfo: () => {},
          writeVerbose: () => {},
          writeSuccess: () => {},
        },
      },
    });

    mock.module("../../registryProxy/registryProxy.js", {
      namedExports: {
        mergeSafeChainProxyEnvironmentVariables: (env) => ({
          ...env,
          ...customEnv,
          HTTPS_PROXY: "http://localhost:8080",
          GLOBAL_AGENT_HTTP_PROXY: "http://localhost:8080",
        }),
      },
    });

    mock.module("../../registryProxy/certBundle.js", {
      namedExports: {
        getCombinedCaBundlePath: () => "/tmp/test-combined-ca.pem",
      },
    });

    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: async (command, args, options) => {
          capturedArgs = { command, args, options };
          if (spawnError) {
            throw spawnError;
          }
          return spawnResult;
        },
      },
    });

    const mod = await import("./runUvCommand.js");
    runUv = mod.runUv;
  });

  afterEach(() => {
    mock.reset();
  });

  it("sets CA env vars and proxies before spawning", async () => {
    const res = await runUv("uv", ["pip", "install", "requests"]);

    assert.strictEqual(res.status, 0);
    assert.ok(capturedArgs, "safeSpawn should have been called");

    assert.strictEqual(capturedArgs.command, "uv");
    assert.deepStrictEqual(capturedArgs.args, ["pip", "install", "requests"]);

    const env = capturedArgs.options.env;
    assert.strictEqual(env.SSL_CERT_FILE, "/tmp/test-combined-ca.pem");
    assert.strictEqual(env.REQUESTS_CA_BUNDLE, "/tmp/test-combined-ca.pem");
    assert.strictEqual(env.PIP_CERT, "/tmp/test-combined-ca.pem");
    assert.strictEqual(env.HTTPS_PROXY, "http://localhost:8080");
  });

  it("sets UV_NATIVE_TLS to false", async () => {
    await runUv("uv", ["pip", "install", "requests"]);

    assert.ok(capturedArgs, "safeSpawn should have been called");
    assert.strictEqual(capturedArgs.options.env.UV_NATIVE_TLS, "false");
  });

  it("warns when overriding UV_NATIVE_TLS that was set to true", async () => {
    customEnv = { UV_NATIVE_TLS: "true" };

    await runUv("uv", ["pip", "install", "requests"]);

    assert.ok(capturedArgs, "safeSpawn should have been called");
    assert.strictEqual(capturedArgs.options.env.UV_NATIVE_TLS, "false");
    assert.ok(
      warnings.some((w) => w.includes("UV_NATIVE_TLS")),
      `Expected a warning about UV_NATIVE_TLS override, got: ${warnings.join(", ")}`
    );
  });

  it("does not warn when UV_NATIVE_TLS was not set", async () => {
    await runUv("uv", ["pip", "install", "requests"]);

    assert.ok(
      !warnings.some((w) => w.includes("UV_NATIVE_TLS")),
      `Unexpected UV_NATIVE_TLS warning when variable was not set`
    );
  });

  it("does not warn when UV_NATIVE_TLS was already false", async () => {
    customEnv = { UV_NATIVE_TLS: "false" };

    await runUv("uv", ["pip", "install", "requests"]);

    assert.ok(
      !warnings.some((w) => w.includes("UV_NATIVE_TLS")),
      `Unexpected UV_NATIVE_TLS warning when variable was already false`
    );
  });

  it("sets HTTP_PROXY from HTTPS_PROXY when HTTP_PROXY is missing", async () => {
    await runUv("uv", ["pip", "install", "requests"]);

    assert.ok(capturedArgs, "safeSpawn should have been called");
    assert.strictEqual(capturedArgs.options.env.HTTP_PROXY, "http://localhost:8080");
  });

  it("does not override existing HTTP_PROXY", async () => {
    customEnv = { HTTP_PROXY: "http://corporate-proxy:3128" };

    await runUv("uv", ["pip", "install", "requests"]);

    assert.ok(capturedArgs, "safeSpawn should have been called");
    assert.strictEqual(capturedArgs.options.env.HTTP_PROXY, "http://corporate-proxy:3128");
  });

  it("returns the exit status from safeSpawn", async () => {
    spawnResult = { status: 42 };

    const res = await runUv("uv", ["pip", "install", "requests"]);

    assert.strictEqual(res.status, 42);
  });

  it("returns error status when safeSpawn throws", async () => {
    spawnError = new Error("command not found");

    const res = await runUv("uv", ["pip", "install", "requests"]);

    assert.strictEqual(res.status, 1);
  });
});
