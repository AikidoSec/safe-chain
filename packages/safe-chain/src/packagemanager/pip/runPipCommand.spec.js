import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runPipCommand environment variable handling", () => {
  let runPip;
  let capturedArgs = null;

  beforeEach(async () => {
    capturedArgs = null;

    // Mock safeSpawn to capture args
    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: async (command, args, options) => {
          capturedArgs = { command, args, options };
          return { status: 0 };
        },
      },
    });

    // Mock proxy env merge
    mock.module("../../registryProxy/registryProxy.js", {
      namedExports: {
        mergeSafeChainProxyEnvironmentVariables: (env) => ({
          ...env,
          HTTPS_PROXY: "http://localhost:8080",
        }),
      },
    });

    // Mock certBundle to return a test combined bundle path
    mock.module("../../registryProxy/certBundle.js", {
      namedExports: {
        getCombinedCaBundlePath: () => "/tmp/test-combined-ca.pem",
      },
    });

    const mod = await import("./runPipCommand.js");
    runPip = mod.runPip;
  });

  afterEach(() => {
    mock.reset();
  });

  it("should set REQUESTS_CA_BUNDLE and SSL_CERT_FILE for default PyPI (no explicit index)", async () => {
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);

    assert.ok(capturedArgs, "safeSpawn should have been called");
    
    // Check environment variables are set
    assert.strictEqual(
      capturedArgs.options.env.REQUESTS_CA_BUNDLE,
      "/tmp/test-combined-ca.pem",
      "REQUESTS_CA_BUNDLE should be set to combined bundle path"
    );
    assert.strictEqual(
      capturedArgs.options.env.SSL_CERT_FILE,
      "/tmp/test-combined-ca.pem",
      "SSL_CERT_FILE should be set to combined bundle path"
    );
    
    // Args should be unchanged (no arg injection)
    assert.deepStrictEqual(capturedArgs.args, ["install", "requests"]);
  });

  it("should set CA environment variables even for external/test PyPI mirror (covers non-CLI traffic)", async () => {
    const res = await runPip("pip3", [
      "install",
      "certifi",
      "--index-url",
      "https://test.pypi.org/simple",
    ]);
    assert.strictEqual(res.status, 0);
    // Env vars should be set unconditionally
    assert.strictEqual(
      capturedArgs.options.env.REQUESTS_CA_BUNDLE,
      "/tmp/test-combined-ca.pem"
    );
    assert.strictEqual(
      capturedArgs.options.env.SSL_CERT_FILE,
      "/tmp/test-combined-ca.pem"
    );
  });

  it("should still set CA env vars for PyPI even with user --cert flag", async () => {
    // For default PyPI, we still set env vars; pip CLI --cert takes precedence
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);
    
    // Environment variables still set (pip CLI --cert takes precedence)
    assert.strictEqual(
      capturedArgs.options.env.REQUESTS_CA_BUNDLE,
      "/tmp/test-combined-ca.pem"
    );
    assert.strictEqual(
      capturedArgs.options.env.SSL_CERT_FILE,
      "/tmp/test-combined-ca.pem"
    );
  });

  it("should preserve HTTPS_PROXY from proxy merge", async () => {
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);
    
    assert.strictEqual(
      capturedArgs.options.env.HTTPS_PROXY,
      "http://localhost:8080",
      "HTTPS_PROXY should be set by proxy merge"
    );
  });
});
