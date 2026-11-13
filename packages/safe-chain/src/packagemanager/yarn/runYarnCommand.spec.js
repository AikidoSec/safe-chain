import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runYarnCommand", () => {
  let runYarnCommand;
  let capturedEnv;
  let capturedArgs;
  let yarnVersion;
  let warnings;

  beforeEach(async () => {
    capturedEnv = null;
    capturedArgs = null;
    yarnVersion = "4.1.0"; // Default to v4
    warnings = [];

    // Mock safeSpawn to capture env and control yarn version
    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: async (command, args, options) => {
          if (args.includes("--version")) {
            // Mock yarn version check
            return { status: 0, stdout: yarnVersion };
          }
          // Capture the env and args for assertions
          capturedEnv = options.env;
          capturedArgs = args;
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
          writeWarning: (msg) => {
            warnings.push(msg);
          },
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

  describe("proxy bypass mitigation", () => {
    describe("command-line proxy argument filtering", () => {
      it("should filter --proxy argument from yarn command", async () => {
        await runYarnCommand(["add", "lodash", "--proxy=http://evil.com:9999"]);

        assert.ok(!capturedArgs.includes("--proxy=http://evil.com:9999"));
        assert.ok(capturedArgs.includes("add"));
        assert.ok(capturedArgs.includes("lodash"));
        assert.ok(warnings.some(w => w.includes("yarn") && w.includes("--proxy")));
      });

      it("should filter --https-proxy argument from yarn command", async () => {
        await runYarnCommand(["add", "--https-proxy", "http://evil.com:9999", "lodash"]);

        assert.ok(!capturedArgs.includes("--https-proxy"));
        assert.ok(!capturedArgs.includes("http://evil.com:9999"));
        assert.ok(capturedArgs.includes("add"));
        assert.ok(capturedArgs.includes("lodash"));
        assert.ok(warnings.some(w => w.includes("--https-proxy")));
      });

      it("should filter --http-proxy argument from yarn command", async () => {
        await runYarnCommand(["add", "lodash", "--http-proxy=http://evil.com:9999"]);

        assert.ok(!capturedArgs.includes("--http-proxy=http://evil.com:9999"));
        assert.ok(capturedArgs.includes("add"));
        assert.ok(capturedArgs.includes("lodash"));
      });

      it("should filter multiple proxy arguments from yarn command", async () => {
        await runYarnCommand([
          "add",
          "--proxy=http://evil1.com:9999",
          "lodash",
          "--https-proxy",
          "http://evil2.com:8888",
        ]);

        assert.ok(!capturedArgs.includes("--proxy=http://evil1.com:9999"));
        assert.ok(!capturedArgs.includes("--https-proxy"));
        assert.ok(!capturedArgs.includes("http://evil2.com:8888"));
        assert.ok(capturedArgs.includes("add"));
        assert.ok(capturedArgs.includes("lodash"));
        assert.strictEqual(warnings.length, 2);
      });

      it("should preserve yarn-specific options", async () => {
        await runYarnCommand([
          "add",
          "lodash",
          "--dev",
          "--exact",
        ]);

        assert.ok(capturedArgs.includes("add"));
        assert.ok(capturedArgs.includes("lodash"));
        assert.ok(capturedArgs.includes("--dev"));
        assert.ok(capturedArgs.includes("--exact"));
      });
    });

    describe("environment variable filtering", () => {
      it("should remove yarn_https_proxy environment variable", async () => {
        process.env.yarn_https_proxy = "http://evil.com:9999";

        await runYarnCommand(["add", "lodash"]);

        assert.strictEqual(capturedEnv.yarn_https_proxy, undefined);
        assert.ok(warnings.some(w => w.includes("yarn_https_proxy")));

        delete process.env.yarn_https_proxy;
      });

      it("should remove yarn_proxy environment variable", async () => {
        process.env.yarn_proxy = "http://evil.com:9999";

        await runYarnCommand(["add", "lodash"]);

        assert.strictEqual(capturedEnv.yarn_proxy, undefined);
        assert.ok(warnings.some(w => w.includes("yarn_proxy")));

        delete process.env.yarn_proxy;
      });

      it("should remove YARN_PROXY environment variable", async () => {
        process.env.YARN_PROXY = "http://evil.com:9999";

        await runYarnCommand(["add", "lodash"]);

        assert.strictEqual(capturedEnv.YARN_PROXY, undefined);
        assert.ok(warnings.some(w => w.includes("YARN_PROXY")));

        delete process.env.YARN_PROXY;
      });
    });

    describe("combined attack scenarios", () => {
      it("should block bypass via command-line and environment for yarn", async () => {
        process.env.yarn_proxy = "http://evil-env.com:9999";
        process.env.yarn_https_proxy = "http://evil-env2.com:8888";

        await runYarnCommand([
          "add",
          "--proxy=http://evil-cli.com:7777",
          "lodash",
          "--https-proxy",
          "http://evil-cli2.com:6666",
        ]);

        // Command-line args should be filtered
        assert.ok(!capturedArgs.includes("--proxy=http://evil-cli.com:7777"));
        assert.ok(!capturedArgs.includes("--https-proxy"));
        assert.ok(!capturedArgs.includes("http://evil-cli2.com:6666"));

        // Environment variables should be removed
        assert.strictEqual(capturedEnv.yarn_proxy, undefined);
        assert.strictEqual(capturedEnv.yarn_https_proxy, undefined);

        // Safe Chain proxy should be set
        assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://localhost:8080");
        assert.strictEqual(capturedEnv.YARN_HTTPS_PROXY, "http://localhost:8080");

        assert.ok(warnings.length >= 2);

        delete process.env.yarn_proxy;
        delete process.env.yarn_https_proxy;
      });
    });
  });
});
