import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runPnpmCommand - proxy bypass mitigation", () => {
  let runPnpmCommand;
  let safeSpawnMock;
  let capturedArgs;
  let capturedEnv;
  let warnings;

  beforeEach(async () => {
    capturedArgs = null;
    capturedEnv = null;
    warnings = [];

    safeSpawnMock = mock.fn(async (command, args, options) => {
      capturedArgs = args;
      capturedEnv = options.env;
      return { status: 0 };
    });

    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: safeSpawnMock,
      },
    });

    mock.module("../../registryProxy/registryProxy.js", {
      namedExports: {
        mergeSafeChainProxyEnvironmentVariables: (env) => {
          return {
            ...env,
            HTTPS_PROXY: "http://127.0.0.1:8080",
            NODE_EXTRA_CA_CERTS: "/path/to/ca-cert.pem",
          };
        },
      },
    });

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

    const mod = await import("./runPnpmCommand.js");
    runPnpmCommand = mod.runPnpmCommand;
  });

  afterEach(() => {
    mock.reset();
  });

  describe("command-line proxy argument filtering for pnpm", () => {
    it("should filter --proxy argument from pnpm command", async () => {
      await runPnpmCommand(["install", "lodash", "--proxy=http://evil.com:9999"], "pnpm");

      assert.ok(!capturedArgs.includes("--proxy=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.some(w => w.includes("pnpm") && w.includes("--proxy")));
    });

    it("should filter --https-proxy argument from pnpm command", async () => {
      await runPnpmCommand(["install", "--https-proxy", "http://evil.com:9999", "lodash"], "pnpm");

      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.some(w => w.includes("--https-proxy")));
    });

    it("should filter --noproxy argument from pnpm command", async () => {
      await runPnpmCommand(["install", "lodash", "--noproxy=*"], "pnpm");

      assert.ok(!capturedArgs.includes("--noproxy=*"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
    });

    it("should preserve pnpm-specific options", async () => {
      await runPnpmCommand([
        "install",
        "lodash",
        "--save-dev",
        "--workspace-root",
        "--filter=@scope/package",
      ], "pnpm");

      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(capturedArgs.includes("--save-dev"));
      assert.ok(capturedArgs.includes("--workspace-root"));
      assert.ok(capturedArgs.includes("--filter=@scope/package"));
    });
  });

  describe("command-line proxy argument filtering for pnpx", () => {
    it("should filter --proxy argument from pnpx command", async () => {
      await runPnpmCommand(["cowsay", "hello", "--proxy=http://evil.com:9999"], "pnpx");

      assert.ok(!capturedArgs.includes("--proxy=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("cowsay"));
      assert.ok(capturedArgs.includes("hello"));
      assert.ok(warnings.some(w => w.includes("pnpx") && w.includes("--proxy")));
    });

    it("should filter --https-proxy argument from pnpx command", async () => {
      await runPnpmCommand(["--https-proxy", "http://evil.com:9999", "cowsay", "hello"], "pnpx");

      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil.com:9999"));
      assert.ok(capturedArgs.includes("cowsay"));
      assert.ok(capturedArgs.includes("hello"));
    });
  });

  describe("environment variable filtering", () => {
    it("should remove npm_config_proxy for pnpm", async () => {
      process.env.npm_config_proxy = "http://evil.com:9999";

      await runPnpmCommand(["install", "lodash"], "pnpm");

      assert.strictEqual(capturedEnv.npm_config_proxy, "http://127.0.0.1:8080");
      assert.ok(warnings.some(w => w.includes("npm_config_proxy")));

      delete process.env.npm_config_proxy;
    });

    it("should remove npm_config_https_proxy for pnpm", async () => {
      process.env.npm_config_https_proxy = "http://evil.com:9999";

      await runPnpmCommand(["install", "lodash"], "pnpm");

      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");
      assert.ok(warnings.some(w => w.includes("npm_config_https_proxy")));

      delete process.env.npm_config_https_proxy;
    });

    it("should remove NPM_CONFIG_PROXY for pnpm", async () => {
      process.env.NPM_CONFIG_PROXY = "http://evil.com:9999";

      await runPnpmCommand(["install", "lodash"], "pnpm");

      assert.strictEqual(capturedEnv.NPM_CONFIG_PROXY, undefined);
      assert.ok(warnings.some(w => w.includes("NPM_CONFIG_PROXY")));

      delete process.env.NPM_CONFIG_PROXY;
    });

    it("should set npm_config_https_proxy to Safe Chain proxy for pnpm", async () => {
      await runPnpmCommand(["install", "lodash"], "pnpm");

      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");
      assert.strictEqual(capturedEnv.npm_config_proxy, "http://127.0.0.1:8080");
      assert.strictEqual(capturedEnv.npm_config_noproxy, "");
    });

    it("should preserve HTTPS_PROXY for pnpm", async () => {
      await runPnpmCommand(["install", "lodash"], "pnpm");

      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");
    });

    it("should preserve NODE_EXTRA_CA_CERTS for pnpm", async () => {
      await runPnpmCommand(["install", "lodash"], "pnpm");

      assert.strictEqual(capturedEnv.NODE_EXTRA_CA_CERTS, "/path/to/ca-cert.pem");
    });
  });

  describe("combined attack scenarios", () => {
    it("should block bypass via command-line and environment for pnpm", async () => {
      process.env.npm_config_proxy = "http://evil-env.com:9999";
      process.env.npm_config_noproxy = "registry.npmjs.org";

      await runPnpmCommand([
        "install",
        "--proxy=http://evil-cli.com:8888",
        "lodash",
        "--https-proxy",
        "http://evil-cli2.com:7777",
      ], "pnpm");

      // Command-line args should be filtered
      assert.ok(!capturedArgs.includes("--proxy=http://evil-cli.com:8888"));
      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil-cli2.com:7777"));

      // Environment variables should be overridden
      assert.strictEqual(capturedEnv.npm_config_proxy, "http://127.0.0.1:8080");
      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");
      assert.strictEqual(capturedEnv.npm_config_noproxy, "");

      // Safe Chain proxy should be set
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");

      assert.ok(warnings.length >= 2);

      delete process.env.npm_config_proxy;
      delete process.env.npm_config_noproxy;
    });

    it("should block bypass via command-line and environment for pnpx", async () => {
      process.env.npm_config_https_proxy = "http://evil-env.com:9999";

      await runPnpmCommand([
        "--proxy=http://evil-cli.com:8888",
        "cowsay",
        "hello",
      ], "pnpx");

      // Command-line args should be filtered
      assert.ok(!capturedArgs.includes("--proxy=http://evil-cli.com:8888"));

      // Environment variable should be overridden
      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");

      // Safe Chain proxy should be set
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");

      delete process.env.npm_config_https_proxy;
    });
  });

  describe("edge cases", () => {
    it("should handle empty args array for pnpm", async () => {
      await runPnpmCommand([], "pnpm");

      assert.deepStrictEqual(capturedArgs, []);
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");
    });

    it("should handle multiple proxy options for pnpm", async () => {
      await runPnpmCommand([
        "install",
        "--proxy=http://evil1.com:9999",
        "lodash",
        "--https-proxy=http://evil2.com:8888",
        "--noproxy=*",
      ], "pnpm");

      assert.ok(!capturedArgs.includes("--proxy=http://evil1.com:9999"));
      assert.ok(!capturedArgs.includes("--https-proxy=http://evil2.com:8888"));
      assert.ok(!capturedArgs.includes("--noproxy=*"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.strictEqual(warnings.length, 3);
    });
  });
});
