import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runPipXCommand", () => {
  let runPipX;
  let safeSpawnMock;
  let warnMock;
  let errorMock;
  let mergeCalls;
  let mergedEnvReturn;

  beforeEach(async () => {
    mergeCalls = [];
    mergedEnvReturn = {
      HTTPS_PROXY: "http://localhost:8080",
      HTTP_PROXY: "",
    };

    safeSpawnMock = mock.fn(async () => ({ status: 0 }));
    warnMock = mock.fn();
    errorMock = mock.fn();

    mock.module("../../environment/userInteraction.js", {
      namedExports: {
        ui: {
          writeWarning: warnMock,
          writeError: errorMock,
          writeInfo: () => {},
          writeVerbose: () => {},
          writeSuccess: () => {},
        },
      },
    });

    mock.module("../../registryProxy/registryProxy.js", {
      namedExports: {
        mergeSafeChainProxyEnvironmentVariables: (env) => {
          mergeCalls.push(env);
          return { ...env, ...mergedEnvReturn };
        },
      },
    });

    mock.module("../../registryProxy/certBundle.js", {
      namedExports: {
        getCombinedCaBundlePath: () => "/tmp/test-combined-ca.pem",
      },
    });

    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: safeSpawnMock,
      },
    });

    const mod = await import("./runPipXCommand.js");
    runPipX = mod.runPipX;
  });

  afterEach(() => {
    mock.reset();
  });

  it("sets CA env vars and proxies before spawning", async () => {
    const res = await runPipX("pipx", ["install", "ruff"]);

    assert.strictEqual(res.status, 0);
    assert.strictEqual(safeSpawnMock.mock.calls.length, 1, "safeSpawn should be called once");

    const [, , options] = safeSpawnMock.mock.calls[0].arguments;
    const env = options.env;

    assert.strictEqual(env.SSL_CERT_FILE, "/tmp/test-combined-ca.pem");
    assert.strictEqual(env.REQUESTS_CA_BUNDLE, "/tmp/test-combined-ca.pem");
    assert.strictEqual(env.PIP_CERT, "/tmp/test-combined-ca.pem");
    assert.strictEqual(env.HTTPS_PROXY, "http://localhost:8080");
    assert.strictEqual(env.HTTP_PROXY, "");
    assert.ok(mergeCalls.length >= 1, "proxy merge should be invoked");
  });

  it("overwrites user CA env vars and warns", async () => {
    mergedEnvReturn = {
      HTTPS_PROXY: "http://localhost:8080",
      HTTP_PROXY: "",
      SSL_CERT_FILE: "user-ssl",
      REQUESTS_CA_BUNDLE: "user-requests",
      PIP_CERT: "user-pip",
    };

    await runPipX("pipx", ["install", "ruff"]);

    const [, , options] = safeSpawnMock.mock.calls[0].arguments;
    const env = options.env;

    assert.strictEqual(env.SSL_CERT_FILE, "/tmp/test-combined-ca.pem", "SSL cert should be overwritten");
    assert.strictEqual(env.REQUESTS_CA_BUNDLE, "/tmp/test-combined-ca.pem", "requests bundle should be overwritten");
    assert.strictEqual(env.PIP_CERT, "/tmp/test-combined-ca.pem", "pip cert should be overwritten");
    assert.strictEqual(warnMock.mock.calls.length, 3, "should warn for each overwritten var");
  });
});
