import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runNpxCommand - proxy bypass mitigation", () => {
  let runNpx;
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

    const mod = await import("./runNpxCommand.js");
    runNpx = mod.runNpx;
  });

  afterEach(() => {
    mock.reset();
  });

  describe("command-line proxy argument filtering", () => {
    it("should filter --proxy argument from npx command", async () => {
      await runNpx(["cowsay", "hello", "--proxy=http://evil.com:9999"]);

      assert.ok(!capturedArgs.includes("--proxy=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("cowsay"));
      assert.ok(capturedArgs.includes("hello"));
      assert.ok(warnings.some(w => w.includes("--proxy")));
    });

    it("should filter --https-proxy argument from npx command", async () => {
      await runNpx(["--https-proxy", "http://evil.com:9999", "cowsay", "hello"]);

      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil.com:9999"));
      assert.ok(capturedArgs.includes("cowsay"));
      assert.ok(capturedArgs.includes("hello"));
      assert.ok(warnings.some(w => w.includes("--https-proxy")));
    });

    it("should filter --noproxy argument from npx command", async () => {
      await runNpx(["cowsay", "--noproxy=*", "hello"]);

      assert.ok(!capturedArgs.includes("--noproxy=*"));
      assert.ok(capturedArgs.includes("cowsay"));
      assert.ok(capturedArgs.includes("hello"));
    });

    it("should preserve npx-specific options", async () => {
      await runNpx(["--yes", "--package=cowsay", "cowsay", "hello"]);

      assert.ok(capturedArgs.includes("--yes"));
      assert.ok(capturedArgs.includes("--package=cowsay"));
      assert.ok(capturedArgs.includes("cowsay"));
      assert.ok(capturedArgs.includes("hello"));
    });
  });

  describe("environment variable filtering", () => {
    it("should remove npm_config_proxy for npx", async () => {
      process.env.npm_config_proxy = "http://evil.com:9999";

      await runNpx(["cowsay", "hello"]);

      assert.strictEqual(capturedEnv.npm_config_proxy, "http://127.0.0.1:8080");
      assert.ok(warnings.some(w => w.includes("npm_config_proxy")));

      delete process.env.npm_config_proxy;
    });

    it("should set npm_config_https_proxy to Safe Chain proxy for npx", async () => {
      await runNpx(["cowsay", "hello"]);

      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");
      assert.strictEqual(capturedEnv.npm_config_proxy, "http://127.0.0.1:8080");
      assert.strictEqual(capturedEnv.npm_config_noproxy, "");
    });

    it("should preserve HTTPS_PROXY for npx", async () => {
      await runNpx(["cowsay", "hello"]);

      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");
    });
  });

  describe("combined attack scenarios", () => {
    it("should block bypass via command-line and environment for npx", async () => {
      process.env.npm_config_https_proxy = "http://evil-env.com:9999";

      await runNpx([
        "--proxy=http://evil-cli.com:8888",
        "cowsay",
        "--https-proxy",
        "http://evil-cli2.com:7777",
        "hello",
      ]);

      // Command-line args should be filtered
      assert.ok(!capturedArgs.includes("--proxy=http://evil-cli.com:8888"));
      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil-cli2.com:7777"));

      // Environment variable should be overridden
      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");

      // Safe Chain proxy should be set
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");

      delete process.env.npm_config_https_proxy;
    });
  });
});
