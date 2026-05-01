import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runRushCommand", () => {
  let runRushCommand;
  let safeSpawnMock;
  let mergeCalls;
  let mergeResultEnv;
  let nextSpawnStatus;
  let nextSpawnError;

  beforeEach(async () => {
    mergeCalls = [];
    mergeResultEnv = null;
    nextSpawnStatus = 0;
    nextSpawnError = null;
    safeSpawnMock = mock.fn(async () => {
      if (nextSpawnError) {
        const error = nextSpawnError;
        nextSpawnError = null;
        throw error;
      }

      return { status: nextSpawnStatus };
    });

    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: safeSpawnMock,
      },
    });

    mock.module("../../registryProxy/registryProxy.js", {
      namedExports: {
        mergeSafeChainProxyEnvironmentVariables: (env) => {
          mergeCalls.push(env);
          if (mergeResultEnv) {
            return mergeResultEnv;
          }

          return {
            ...env,
            HTTPS_PROXY: "http://localhost:8080",
          };
        },
      },
    });

    // commandErrors reports through ui on failures, so provide a no-op mock
    mock.module("../../environment/userInteraction.js", {
      namedExports: {
        ui: {
          writeError: () => {},
        },
      },
    });

    const mod = await import("./runRushCommand.js");
    runRushCommand = mod.runRushCommand;
  });

  afterEach(() => {
    mock.reset();
  });

  it("spawns rush with merged proxy env", async () => {
    const res = await runRushCommand("rush", ["install"]);

    assert.strictEqual(res.status, 0);
    assert.strictEqual(safeSpawnMock.mock.calls.length, 1);

    const [command, args, options] = safeSpawnMock.mock.calls[0].arguments;
    assert.strictEqual(command, "rush");
    assert.deepStrictEqual(args, ["install"]);
    assert.strictEqual(options.stdio, "inherit");
    assert.strictEqual(options.env.HTTPS_PROXY, "http://localhost:8080");
    assert.strictEqual(options.env.HTTP_PROXY, "http://localhost:8080");
    assert.strictEqual(options.env.https_proxy, "http://localhost:8080");
    assert.strictEqual(options.env.http_proxy, "http://localhost:8080");
    assert.strictEqual(options.env.npm_config_https_proxy, "http://localhost:8080");
    assert.strictEqual(options.env.npm_config_proxy, "http://localhost:8080");
    assert.strictEqual(options.env.NPM_CONFIG_HTTPS_PROXY, "http://localhost:8080");
    assert.strictEqual(options.env.NPM_CONFIG_PROXY, "http://localhost:8080");
    assert.strictEqual(options.env.YARN_HTTPS_PROXY, "http://localhost:8080");
    assert.ok(mergeCalls.length >= 1, "proxy env merge should be called");
  });

  it("returns spawn result status", async () => {
    nextSpawnStatus = 7;

    const res = await runRushCommand("rush", ["update"]);

    assert.strictEqual(res.status, 7);
  });

  it("reports failures with rush target", async () => {
    nextSpawnError = Object.assign(new Error("spawn failed"), {
      code: "ENOENT",
    });

    const res = await runRushCommand("rush", ["install"]);

    assert.strictEqual(res.status, 1);
  });

  it("does not mutate merged env object", async () => {
    mergeResultEnv = {
      HTTPS_PROXY: "http://localhost:8080",
    };

    await runRushCommand("rush", ["install"]);

    assert.deepStrictEqual(mergeResultEnv, {
      HTTPS_PROXY: "http://localhost:8080",
    });
  });
});
