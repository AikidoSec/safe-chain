import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runNpmCommand - proxy bypass mitigation", () => {
  let runNpm;
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

    const mod = await import("./runNpmCommand.js");
    runNpm = mod.runNpm;
  });

  afterEach(() => {
    mock.reset();
  });

  describe("command-line proxy argument filtering", () => {
    it("should filter --proxy argument with equals syntax", async () => {
      await runNpm(["install", "lodash", "--proxy=http://evil.com:9999"]);

      assert.ok(!capturedArgs.includes("--proxy=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.some(w => w.includes("--proxy")));
    });

    it("should filter --proxy argument with space syntax", async () => {
      await runNpm(["install", "lodash", "--proxy", "http://evil.com:9999"]);

      assert.ok(!capturedArgs.includes("--proxy"));
      assert.ok(!capturedArgs.includes("http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.some(w => w.includes("--proxy")));
    });

    it("should filter --https-proxy argument", async () => {
      await runNpm(["install", "--https-proxy=http://evil.com:9999", "lodash"]);

      assert.ok(!capturedArgs.includes("--https-proxy=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.some(w => w.includes("--https-proxy")));
    });

    it("should filter --http-proxy argument", async () => {
      await runNpm(["install", "--http-proxy", "http://evil.com:9999", "lodash"]);

      assert.ok(!capturedArgs.includes("--http-proxy"));
      assert.ok(!capturedArgs.includes("http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
    });

    it("should filter --noproxy argument", async () => {
      await runNpm(["install", "lodash", "--noproxy=*"]);

      assert.ok(!capturedArgs.includes("--noproxy=*"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.some(w => w.includes("--noproxy")));
    });

    it("should filter --no-proxy argument", async () => {
      await runNpm(["install", "lodash", "--no-proxy"]);

      assert.ok(!capturedArgs.includes("--no-proxy"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
    });

    it("should filter multiple proxy arguments", async () => {
      await runNpm([
        "install",
        "--proxy=http://evil.com:9999",
        "lodash",
        "--https-proxy",
        "http://evil2.com:8888",
        "--noproxy=*",
      ]);

      assert.ok(!capturedArgs.includes("--proxy=http://evil.com:9999"));
      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil2.com:8888"));
      assert.ok(!capturedArgs.includes("--noproxy=*"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(warnings.length >= 3, `Expected at least 3 warnings, got ${warnings.length}`);
    });

    it("should handle case-insensitive proxy options", async () => {
      await runNpm(["install", "--PROXY=http://evil.com:9999", "lodash"]);

      assert.ok(!capturedArgs.includes("--PROXY=http://evil.com:9999"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
    });

    it("should preserve non-proxy arguments", async () => {
      await runNpm([
        "install",
        "lodash",
        "--save-dev",
        "--registry=https://custom.registry.com",
        "--loglevel=verbose",
      ]);

      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
      assert.ok(capturedArgs.includes("--save-dev"));
      assert.ok(capturedArgs.includes("--registry=https://custom.registry.com"));
      assert.ok(capturedArgs.includes("--loglevel=verbose"));
    });
  });

  describe("environment variable filtering", () => {
    it("should remove npm_config_proxy environment variable", async () => {
      process.env.npm_config_proxy = "http://evil.com:9999";

      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.npm_config_proxy, "http://127.0.0.1:8080");
      assert.ok(warnings.some(w => w.includes("npm_config_proxy")));

      delete process.env.npm_config_proxy;
    });

    it("should remove npm_config_https_proxy environment variable", async () => {
      process.env.npm_config_https_proxy = "http://evil.com:9999";

      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");
      assert.ok(warnings.some(w => w.includes("npm_config_https_proxy")));

      delete process.env.npm_config_https_proxy;
    });

    it("should remove npm_config_http_proxy environment variable", async () => {
      process.env.npm_config_http_proxy = "http://evil.com:9999";

      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.npm_config_http_proxy, undefined);
      assert.ok(warnings.some(w => w.includes("npm_config_http_proxy")));

      delete process.env.npm_config_http_proxy;
    });

    it("should remove npm_config_noproxy environment variable", async () => {
      process.env.npm_config_noproxy = "*";

      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.npm_config_noproxy, "");
      assert.ok(warnings.some(w => w.includes("npm_config_noproxy")));

      delete process.env.npm_config_noproxy;
    });

    it("should remove uppercase NPM_CONFIG_PROXY environment variable", async () => {
      process.env.NPM_CONFIG_PROXY = "http://evil.com:9999";

      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.NPM_CONFIG_PROXY, undefined);
      assert.ok(warnings.some(w => w.includes("NPM_CONFIG_PROXY")));

      delete process.env.NPM_CONFIG_PROXY;
    });

    it("should set npm_config_https_proxy to Safe Chain proxy", async () => {
      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");
      assert.strictEqual(capturedEnv.npm_config_proxy, "http://127.0.0.1:8080");
    });

    it("should set npm_config_noproxy to empty string", async () => {
      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.npm_config_noproxy, "");
    });

    it("should preserve HTTPS_PROXY environment variable", async () => {
      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");
    });

    it("should preserve NODE_EXTRA_CA_CERTS environment variable", async () => {
      await runNpm(["install", "lodash"]);

      assert.strictEqual(capturedEnv.NODE_EXTRA_CA_CERTS, "/path/to/ca-cert.pem");
    });
  });

  describe("combined attack scenarios", () => {
    it("should block bypass via command-line and environment variables", async () => {
      process.env.npm_config_proxy = "http://evil-env.com:9999";

      await runNpm([
        "install",
        "--proxy=http://evil-cli.com:8888",
        "lodash",
        "--https-proxy",
        "http://evil-cli2.com:7777",
      ]);

      // Command-line args should be filtered
      assert.ok(!capturedArgs.includes("--proxy=http://evil-cli.com:8888"));
      assert.ok(!capturedArgs.includes("--https-proxy"));
      assert.ok(!capturedArgs.includes("http://evil-cli2.com:7777"));

      // Environment variable should be overridden
      assert.strictEqual(capturedEnv.npm_config_proxy, "http://127.0.0.1:8080");
      assert.strictEqual(capturedEnv.npm_config_https_proxy, "http://127.0.0.1:8080");

      // Safe Chain proxy should be set
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");

      assert.ok(warnings.length >= 2);

      delete process.env.npm_config_proxy;
    });

    it("should block noproxy bypass attempt", async () => {
      process.env.npm_config_noproxy = "registry.npmjs.org";

      await runNpm(["install", "--noproxy=*", "lodash"]);

      // Command-line arg should be filtered
      assert.ok(!capturedArgs.includes("--noproxy=*"));

      // Environment variable should be set to empty
      assert.strictEqual(capturedEnv.npm_config_noproxy, "");

      delete process.env.npm_config_noproxy;
    });
  });

  describe("edge cases", () => {
    it("should handle empty args array", async () => {
      await runNpm([]);

      assert.deepStrictEqual(capturedArgs, []);
      assert.strictEqual(capturedEnv.HTTPS_PROXY, "http://127.0.0.1:8080");
    });

    it("should handle args with only proxy options", async () => {
      await runNpm(["--proxy=http://evil.com:9999", "--https-proxy=http://evil2.com:8888"]);

      assert.deepStrictEqual(capturedArgs, []);
      assert.strictEqual(warnings.length, 2);
    });

    it("should not filter arguments that contain proxy as substring", async () => {
      await runNpm(["install", "http-proxy-middleware", "--save"]);

      assert.ok(capturedArgs.includes("http-proxy-middleware"));
      assert.ok(capturedArgs.includes("--save"));
    });

    it("should handle proxy option at the end without value", async () => {
      await runNpm(["install", "lodash", "--proxy"]);

      assert.ok(!capturedArgs.includes("--proxy"));
      assert.ok(capturedArgs.includes("install"));
      assert.ok(capturedArgs.includes("lodash"));
    });
  });
});
