import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("createBunPackageManager - proxy bypass mitigation", () => {
  let bunPm;
  let bunxPm;
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

    const mod = await import("./createBunPackageManager.js");
    bunPm = mod.createBunPackageManager();
    bunxPm = mod.createBunxPackageManager();
  });

  afterEach(() => {
    mock.reset();
  });

  describe("command-line proxy argument filtering for bun", () => {
    it("should filter --proxy argument from bun command", async () => {
      await bunPm.runCommand(["install", "lodash", "--proxy=http://evil.com:9999"]);

      assert.ok(!capturedArgs.includes("--proxy=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.some(w => w.includes("bun") && w.includes("--proxy")));
    });

    it("should filter --https-proxy argument from bun command", async () => {
      await bunPm.runCommand(["install", "--https-proxy", "http://evil.com:9999", "lodash"]);

      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.some(w => w.includes("--https-proxy")));
    });

    it("should filter --http-proxy argument from bun command", async () => {
      await bunPm.runCommand(["install", "lodash", "--http-proxy=http://evil.com:9999"]);

      assert.ok(!capturedArgs.includes("--http-proxy=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
    });

    it("should filter multiple proxy arguments from bun command", async () => {
      await bunPm.runCommand([
        "install",
        "--proxy=http://evil1.com:9999",
        "lodash",
        "--https-proxy",
        "http://evil2.com:8888",
      ]);

      assert.ok(!capturedArgs.includes("--proxy=http://evil1.com:9999"));
      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil2.com:8888"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.strictEqual(warnings.length, 2);
    });

    it("should preserve bun-specific options", async () => {
      await bunPm.runCommand([
        "install",
        "lodash",
        "--production",
        "--frozen-lockfile",
      ]);

      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(capturedArgs.includes("--production"));
      assert.ok(capturedArgs.includes("--frozen-lockfile"));
    });
  });

  describe("command-line proxy argument filtering for bunx", () => {
    it("should filter --proxy argument from bunx command", async () => {
      await bunxPm.runCommand(["cowsay", "hello", "--proxy=http://evil.com:9999"]);

      assert.ok(!capturedArgs.includes("--proxy=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("cowsay"));
      assert.ok(capturedArgs.includes("hello"));
      assert.ok(warnings.some(w => w.includes("bunx") && w.includes("--proxy")));
    });

    it("should filter --https-proxy argument from bunx command", async () => {
      await bunxPm.runCommand(["--https-proxy", "http://evil.com:9999", "cowsay", "hello"]);

      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil.com:9999"));
      assert.ok(capturedArgs.includes("cowsay"));
      assert.ok(capturedArgs.includes("hello"));
    });
  });

  describe("environment variable filtering", () => {
    it("should remove http_proxy environment variable for bun", async () => {
      process.env.http_proxy = "http://evil.com:9999";

      await bunPm.runCommand(["install", "lodash"]);

      assert.strictEqual(capturedEnv.http_proxy, undefined);
      assert.ok(warnings.some(w => w.includes("http_proxy")));

      delete process.env.http_proxy;
    });

    it("should remove HTTP_PROXY environment variable for bun", async () => {
      process.env.HTTP_PROXY = "http://evil.com:9999";

      await bunPm.runCommand(["install", "lodash"]);

      assert.strictEqual(capturedEnv.HTTP_PROXY, undefined);
      assert.ok(warnings.some(w => w.includes("HTTP_PROXY")));

      delete process.env.HTTP_PROXY;
    });

    it("should remove ALL_PROXY environment variable for bun", async () => {
      process.env.ALL_PROXY = "http://evil.com:9999";

      await bunPm.runCommand(["install", "lodash"]);

      assert.strictEqual(capturedEnv.ALL_PROXY, undefined);
      assert.ok(warnings.some(w => w.includes("ALL_PROXY")));

      delete process.env.ALL_PROXY;
    });

    it("should remove all_proxy environment variable for bun", async () => {
      process.env.all_proxy = "http://evil.com:9999";

      await bunPm.runCommand(["install", "lodash"]);

      assert.strictEqual(capturedEnv.all_proxy, undefined);
      assert.ok(warnings.some(w => w.includes("all_proxy")));

      delete process.env.all_proxy;
    });

    it("should preserve HTTPS_PROXY for bun", async () => {
      await bunPm.runCommand(["install", "lodash"]);

      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");
    });

    it("should preserve NODE_EXTRA_CA_CERTS for bun", async () => {
      await bunPm.runCommand(["install", "lodash"]);

      assert.strictEqual(capturedEnv.NODE_EXTRA_CA_CERTS, "/path/to/ca-cert.pem");
    });
  });

  describe("combined attack scenarios", () => {
    it("should block bypass via command-line and environment for bun", async () => {
      process.env.HTTP_PROXY = "http://evil-env.com:9999";
      process.env.ALL_PROXY = "http://evil-env2.com:8888";

      await bunPm.runCommand([
        "install",
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
      assert.strictEqual(capturedEnv.HTTP_PROXY, undefined);
      assert.strictEqual(capturedEnv.ALL_PROXY, undefined);

      // Safe Chain proxy should be set
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");

      assert.ok(warnings.length >= 2);

      delete process.env.HTTP_PROXY;
      delete process.env.ALL_PROXY;
    });

    it("should block bypass via command-line and environment for bunx", async () => {
      process.env.http_proxy = "http://evil-env.com:9999";

      await bunxPm.runCommand(["--proxy=http://evil-cli.com:8888", "cowsay", "hello"]);

      // Command-line arg should be filtered
      assert.ok(!capturedArgs.includes("--proxy=http://evil-cli.com:8888"));

      // Environment variable should be removed
      assert.strictEqual(capturedEnv.http_proxy, undefined);

      // Safe Chain proxy should be set
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");

      delete process.env.http_proxy;
    });
  });

  describe("edge cases", () => {
    it("should handle empty args array for bun", async () => {
      await bunPm.runCommand([]);

      assert.deepStrictEqual(capturedArgs, []);
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");
    });

    it("should handle args with only proxy options for bun", async () => {
      await bunPm.runCommand(["--proxy=http://evil.com:9999", "--https-proxy=http://evil2.com:8888"]);

      assert.deepStrictEqual(capturedArgs, []);
      assert.strictEqual(warnings.length, 2);
    });

    it("should not filter arguments that contain proxy as substring", async () => {
      await bunPm.runCommand(["install", "http-proxy-middleware"]);

      assert.ok(capturedArgs.includes("http-proxy-middleware"));
    });
  });
});
