import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runYarnCommand", () => {
  let runYarnCommand;
  let capturedEnv;
  let yarnVersion;

  beforeEach(async () => {
    capturedEnv = null;
    yarnVersion = "4.1.0"; // Default to v4

    // Mock safeSpawn to capture env and control yarn version
    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: async (command, args, options) => {
          if (args.includes("--version")) {
            // Mock yarn version check
            return { status: 0, stdout: yarnVersion };
          }
          // Capture the env for assertions
          capturedEnv = options.env;
          return { status: 0 };
        },
      },
    });

    // Mock mergeSafeChainProxyEnvironmentVariables to return test env
    mock.module("../../registryProxy/registryProxy.js", {
      namedExports: {
        mergeSafeChainProxyEnvironmentVariables: (env) => {
          return {
            ...env,
            HTTPS_PROXY: "http://localhost:8080",
            NODE_EXTRA_CA_CERTS: "/path/to/ca-cert.pem",
          };
        },
      },
    });

    // Mock ui to prevent console output
    mock.module("../../environment/userInteraction.js", {
      namedExports: {
        ui: {
          writeError: () => {},
        },
      },
    });

    const module = await import("./runYarnCommand.js");
    runYarnCommand = module.runYarnCommand;
  });

  afterEach(() => {
    mock.reset();
  });

  it("should set YARN_HTTPS_PROXY for Yarn v4+", async () => {
    yarnVersion = "4.1.0";
    await runYarnCommand(["add", "lodash"]);

    assert.strictEqual(
      capturedEnv.YARN_HTTPS_PROXY,
      "http://localhost:8080",
      "YARN_HTTPS_PROXY should be set to the HTTPS_PROXY value"
    );
    assert.strictEqual(
      capturedEnv.YARN_HTTPS_CA_FILE_PATH,
      undefined,
      "YARN_HTTPS_CA_FILE_PATH should NOT be set to avoid overriding system CAs"
    );
  });

  it("should set YARN_HTTPS_PROXY for Yarn v3", async () => {
    yarnVersion = "3.6.4";
    await runYarnCommand(["add", "lodash"]);

    assert.strictEqual(
      capturedEnv.YARN_HTTPS_PROXY,
      "http://localhost:8080",
      "YARN_HTTPS_PROXY should be set to the HTTPS_PROXY value"
    );
    assert.strictEqual(
      capturedEnv.YARN_CA_FILE_PATH,
      undefined,
      "YARN_CA_FILE_PATH should NOT be set to avoid overriding system CAs"
    );
  });

  it("should set YARN_HTTPS_PROXY for Yarn v2", async () => {
    yarnVersion = "2.4.3";
    await runYarnCommand(["add", "lodash"]);

    assert.strictEqual(
      capturedEnv.YARN_HTTPS_PROXY,
      "http://localhost:8080",
      "YARN_HTTPS_PROXY should be set to the HTTPS_PROXY value"
    );
    assert.strictEqual(
      capturedEnv.YARN_CA_FILE_PATH,
      undefined,
      "YARN_CA_FILE_PATH should NOT be set to avoid overriding system CAs"
    );
  });

  it("should set YARN_HTTPS_PROXY for Yarn v1", async () => {
    yarnVersion = "1.22.19";
    await runYarnCommand(["add", "lodash"]);

    assert.strictEqual(
      capturedEnv.YARN_HTTPS_PROXY,
      "http://localhost:8080",
      "YARN_HTTPS_PROXY should not be set for Yarn v1"
    );
    assert.strictEqual(
      capturedEnv.YARN_HTTPS_CA_FILE_PATH,
      undefined,
      "YARN_HTTPS_CA_FILE_PATH should not be set for Yarn v1"
    );
    assert.strictEqual(
      capturedEnv.YARN_CA_FILE_PATH,
      undefined,
      "YARN_CA_FILE_PATH should not be set for Yarn v1"
    );
  });

  it("should preserve NODE_EXTRA_CA_CERTS for all Yarn versions", async () => {
    for (const version of ["4.1.0", "3.6.4", "2.4.3", "1.22.19"]) {
      yarnVersion = version;
      await runYarnCommand(["add", "lodash"]);

      assert.strictEqual(
        capturedEnv.NODE_EXTRA_CA_CERTS,
        "/path/to/ca-cert.pem",
        `NODE_EXTRA_CA_CERTS should be preserved for Yarn ${version}`
      );
    }
  });

  it("should preserve HTTPS_PROXY for all Yarn versions", async () => {
    for (const version of ["4.1.0", "3.6.4", "2.4.3", "1.22.19"]) {
      yarnVersion = version;
      await runYarnCommand(["add", "lodash"]);

      assert.strictEqual(
        capturedEnv.HTTPS_PROXY,
        "http://localhost:8080",
        `HTTPS_PROXY should be preserved for Yarn ${version}`
      );
    }
  });
});
