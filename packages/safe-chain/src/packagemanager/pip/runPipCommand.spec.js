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

    const mod = await import("./runPipCommand.js");
    runPip = mod.runPip;
  });

  afterEach(() => {
    mock.reset();
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
