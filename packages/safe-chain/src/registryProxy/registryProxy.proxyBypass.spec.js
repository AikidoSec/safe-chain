import { before, after, describe, it } from "node:test";
import assert from "node:assert";
import {
  createSafeChainProxy,
  mergeSafeChainProxyEnvironmentVariables,
} from "./registryProxy.js";

/**
 * Tests for the proxy bypass vulnerability mitigation.
 * 
 * Pentest finding: Inherited proxy bypass variables can disable Safe Chain 
 * inspection for package-manager subprocesses.
 * 
 * The vulnerability allowed inherited environment variables (NO_PROXY, HTTP_PROXY, 
 * ALL_PROXY, and their lowercase variants) to bypass Safe Chain's inspection proxy.
 * 
 * The fix ensures that Safe Chain explicitly sets all proxy-related environment 
 * variables (including both uppercase and lowercase variants) to force traffic 
 * through the inspection proxy, and sets NO_PROXY to empty string to prevent 
 * bypass.
 */
describe("registryProxy.proxyBypass - mitigation tests", () => {
  let proxy;

  before(async () => {
    proxy = createSafeChainProxy();
    await proxy.startServer();
  });

  after(async () => {
    await proxy.stopServer();
  });

  describe("NO_PROXY bypass prevention", () => {
    it("should override inherited NO_PROXY with empty string", () => {
      const inheritedEnv = {
        NO_PROXY: "*",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // NO_PROXY should be explicitly set to empty string, not inherited
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.ok(mergedEnv.HTTPS_PROXY);
      assert.ok(mergedEnv.HTTPS_PROXY.startsWith("http://127.0.0.1:"));
    });

    it("should override inherited no_proxy (lowercase) with empty string", () => {
      const inheritedEnv = {
        no_proxy: "localhost,127.0.0.1,registry.npmjs.org",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // no_proxy should be explicitly set to empty string, not inherited
      assert.strictEqual(mergedEnv.no_proxy, "");
      assert.ok(mergedEnv.https_proxy);
      assert.ok(mergedEnv.https_proxy.startsWith("http://127.0.0.1:"));
    });

    it("should override NO_PROXY=* wildcard bypass attempt", () => {
      const inheritedEnv = {
        NO_PROXY: "*",
        no_proxy: "*",
        OTHER_VAR: "value",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // Both uppercase and lowercase NO_PROXY should be empty
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.strictEqual(mergedEnv.no_proxy, "");
      // Safe Chain proxy should be set
      assert.ok(mergedEnv.HTTPS_PROXY);
      assert.ok(mergedEnv.HTTP_PROXY);
    });

    it("should override NO_PROXY with registry hostnames", () => {
      const inheritedEnv = {
        NO_PROXY: "registry.npmjs.org,pypi.org,registry.yarnpkg.com",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // NO_PROXY should be empty, forcing all traffic through Safe Chain proxy
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.ok(mergedEnv.HTTPS_PROXY);
    });
  });

  describe("HTTP_PROXY bypass prevention", () => {
    it("should override inherited HTTP_PROXY with Safe Chain proxy", () => {
      const inheritedEnv = {
        HTTP_PROXY: "http://malicious-proxy.example.com:8080",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // HTTP_PROXY should be set to Safe Chain proxy, not inherited value
      assert.ok(mergedEnv.HTTP_PROXY);
      assert.ok(mergedEnv.HTTP_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(!mergedEnv.HTTP_PROXY.includes("malicious-proxy"));
    });

    it("should override inherited http_proxy (lowercase) with Safe Chain proxy", () => {
      const inheritedEnv = {
        http_proxy: "http://attacker-proxy.example.com:3128",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // http_proxy should be set to Safe Chain proxy
      assert.ok(mergedEnv.http_proxy);
      assert.ok(mergedEnv.http_proxy.startsWith("http://127.0.0.1:"));
      assert.ok(!mergedEnv.http_proxy.includes("attacker-proxy"));
    });

    it("should set both HTTP_PROXY and http_proxy to Safe Chain proxy", () => {
      const inheritedEnv = {
        HTTP_PROXY: "http://proxy1.example.com:8080",
        http_proxy: "http://proxy2.example.com:8080",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // Both should point to Safe Chain proxy
      assert.ok(mergedEnv.HTTP_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(mergedEnv.http_proxy.startsWith("http://127.0.0.1:"));
      // Both should have the same value
      assert.strictEqual(mergedEnv.HTTP_PROXY, mergedEnv.http_proxy);
    });
  });

  describe("HTTPS_PROXY bypass prevention", () => {
    it("should override inherited HTTPS_PROXY with Safe Chain proxy", () => {
      const inheritedEnv = {
        HTTPS_PROXY: "http://external-proxy.example.com:8080",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // HTTPS_PROXY should be set to Safe Chain proxy
      assert.ok(mergedEnv.HTTPS_PROXY);
      assert.ok(mergedEnv.HTTPS_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(!mergedEnv.HTTPS_PROXY.includes("external-proxy"));
    });

    it("should override inherited https_proxy (lowercase) with Safe Chain proxy", () => {
      const inheritedEnv = {
        https_proxy: "http://bypass-proxy.example.com:8080",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // https_proxy should be set to Safe Chain proxy
      assert.ok(mergedEnv.https_proxy);
      assert.ok(mergedEnv.https_proxy.startsWith("http://127.0.0.1:"));
      assert.ok(!mergedEnv.https_proxy.includes("bypass-proxy"));
    });
  });

  describe("ALL_PROXY bypass prevention", () => {
    it("should override inherited ALL_PROXY with Safe Chain proxy", () => {
      const inheritedEnv = {
        ALL_PROXY: "socks5://proxy.example.com:1080",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // ALL_PROXY should be set to Safe Chain proxy
      assert.ok(mergedEnv.ALL_PROXY);
      assert.ok(mergedEnv.ALL_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(!mergedEnv.ALL_PROXY.includes("proxy.example.com"));
    });

    it("should override inherited all_proxy (lowercase) with Safe Chain proxy", () => {
      const inheritedEnv = {
        all_proxy: "http://universal-proxy.example.com:8080",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // all_proxy should be set to Safe Chain proxy
      assert.ok(mergedEnv.all_proxy);
      assert.ok(mergedEnv.all_proxy.startsWith("http://127.0.0.1:"));
      assert.ok(!mergedEnv.all_proxy.includes("universal-proxy"));
    });

    it("should set both ALL_PROXY and all_proxy to Safe Chain proxy", () => {
      const inheritedEnv = {
        ALL_PROXY: "http://proxy1.example.com:8080",
        all_proxy: "http://proxy2.example.com:8080",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // Both should point to Safe Chain proxy
      assert.ok(mergedEnv.ALL_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(mergedEnv.all_proxy.startsWith("http://127.0.0.1:"));
      // Both should have the same value
      assert.strictEqual(mergedEnv.ALL_PROXY, mergedEnv.all_proxy);
    });
  });

  describe("Combined bypass attempts", () => {
    it("should override all proxy variables in a combined attack scenario", () => {
      const inheritedEnv = {
        NO_PROXY: "*",
        no_proxy: "*",
        HTTP_PROXY: "http://attacker1.example.com:8080",
        http_proxy: "http://attacker2.example.com:8080",
        HTTPS_PROXY: "http://attacker3.example.com:8080",
        https_proxy: "http://attacker4.example.com:8080",
        ALL_PROXY: "http://attacker5.example.com:8080",
        all_proxy: "http://attacker6.example.com:8080",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // All NO_PROXY variants should be empty
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.strictEqual(mergedEnv.no_proxy, "");

      // All proxy variables should point to Safe Chain proxy
      const safeChainProxyPattern = /^http:\/\/127\.0\.0\.1:\d+$/;
      assert.ok(safeChainProxyPattern.test(mergedEnv.HTTP_PROXY));
      assert.ok(safeChainProxyPattern.test(mergedEnv.http_proxy));
      assert.ok(safeChainProxyPattern.test(mergedEnv.HTTPS_PROXY));
      assert.ok(safeChainProxyPattern.test(mergedEnv.https_proxy));
      assert.ok(safeChainProxyPattern.test(mergedEnv.ALL_PROXY));
      assert.ok(safeChainProxyPattern.test(mergedEnv.all_proxy));

      // All proxy variables should have the same value
      assert.strictEqual(mergedEnv.HTTP_PROXY, mergedEnv.HTTPS_PROXY);
      assert.strictEqual(mergedEnv.HTTP_PROXY, mergedEnv.ALL_PROXY);
      assert.strictEqual(mergedEnv.http_proxy, mergedEnv.https_proxy);
      assert.strictEqual(mergedEnv.http_proxy, mergedEnv.all_proxy);

      // No attacker proxy should remain
      const envString = JSON.stringify(mergedEnv);
      assert.ok(!envString.includes("attacker"));
    });

    it("should preserve non-proxy environment variables", () => {
      const inheritedEnv = {
        NO_PROXY: "*",
        HTTP_PROXY: "http://bad-proxy.example.com:8080",
        PATH: "/usr/local/bin:/usr/bin",
        HOME: "/home/user",
        USER: "testuser",
        CUSTOM_VAR: "custom_value",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // Non-proxy variables should be preserved
      assert.strictEqual(mergedEnv.PATH, "/usr/local/bin:/usr/bin");
      assert.strictEqual(mergedEnv.HOME, "/home/user");
      assert.strictEqual(mergedEnv.USER, "testuser");
      assert.strictEqual(mergedEnv.CUSTOM_VAR, "custom_value");

      // Proxy variables should be overridden
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.ok(mergedEnv.HTTP_PROXY.startsWith("http://127.0.0.1:"));
    });
  });

  describe("Case sensitivity handling", () => {
    it("should handle mixed case proxy variables correctly", () => {
      const inheritedEnv = {
        Http_Proxy: "http://mixed-case-proxy.example.com:8080",
        Https_Proxy: "http://mixed-case-proxy.example.com:8080",
        No_Proxy: "localhost",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // Safe Chain should set both uppercase and lowercase variants
      assert.ok(mergedEnv.HTTP_PROXY);
      assert.ok(mergedEnv.http_proxy);
      assert.ok(mergedEnv.HTTPS_PROXY);
      assert.ok(mergedEnv.https_proxy);
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.strictEqual(mergedEnv.no_proxy, "");

      // Mixed case variants are not preserved because the merge logic
      // checks uppercase keys. Most clients only check uppercase or lowercase,
      // not mixed case, so this is not a security concern.
    });
  });

  describe("Empty environment handling", () => {
    it("should set all proxy variables even with empty inherited environment", () => {
      const inheritedEnv = {};

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // All proxy variables should be set
      assert.ok(mergedEnv.HTTP_PROXY);
      assert.ok(mergedEnv.http_proxy);
      assert.ok(mergedEnv.HTTPS_PROXY);
      assert.ok(mergedEnv.https_proxy);
      assert.ok(mergedEnv.ALL_PROXY);
      assert.ok(mergedEnv.all_proxy);
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.strictEqual(mergedEnv.no_proxy, "");

      // All should point to Safe Chain proxy
      const safeChainProxyPattern = /^http:\/\/127\.0\.0\.1:\d+$/;
      assert.ok(safeChainProxyPattern.test(mergedEnv.HTTP_PROXY));
      assert.ok(safeChainProxyPattern.test(mergedEnv.HTTPS_PROXY));
      assert.ok(safeChainProxyPattern.test(mergedEnv.ALL_PROXY));
    });
  });

  describe("Security properties validation", () => {
    it("should ensure all proxy traffic routes through loopback address", () => {
      const inheritedEnv = {
        HTTP_PROXY: "http://0.0.0.0:8080", // Attempt to bind to all interfaces
        HTTPS_PROXY: "http://192.168.1.100:8080", // Attempt to use network proxy
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // All proxy URLs should use 127.0.0.1 (loopback)
      const proxyUrl = new URL(mergedEnv.HTTPS_PROXY);
      assert.strictEqual(proxyUrl.hostname, "127.0.0.1");

      const httpProxyUrl = new URL(mergedEnv.HTTP_PROXY);
      assert.strictEqual(httpProxyUrl.hostname, "127.0.0.1");

      const allProxyUrl = new URL(mergedEnv.ALL_PROXY);
      assert.strictEqual(allProxyUrl.hostname, "127.0.0.1");
    });

    it("should ensure NO_PROXY cannot exclude any hosts", () => {
      const testCases = [
        { NO_PROXY: "*" },
        { NO_PROXY: "registry.npmjs.org,pypi.org" },
        { NO_PROXY: "localhost,127.0.0.1,.local" },
        { no_proxy: "*" },
        { no_proxy: ".example.com" },
      ];

      for (const testCase of testCases) {
        const mergedEnv = mergeSafeChainProxyEnvironmentVariables(testCase);
        
        // NO_PROXY should always be empty string
        assert.strictEqual(mergedEnv.NO_PROXY, "", 
          `NO_PROXY should be empty for input: ${JSON.stringify(testCase)}`);
        assert.strictEqual(mergedEnv.no_proxy, "",
          `no_proxy should be empty for input: ${JSON.stringify(testCase)}`);
      }
    });

    it("should ensure proxy URL uses HTTP protocol (not HTTPS or SOCKS)", () => {
      const inheritedEnv = {
        HTTPS_PROXY: "https://secure-proxy.example.com:8080",
        ALL_PROXY: "socks5://socks-proxy.example.com:1080",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);

      // Safe Chain proxy should use HTTP protocol
      assert.ok(mergedEnv.HTTPS_PROXY.startsWith("http://"));
      assert.ok(mergedEnv.ALL_PROXY.startsWith("http://"));
      assert.ok(!mergedEnv.HTTPS_PROXY.startsWith("https://"));
      assert.ok(!mergedEnv.ALL_PROXY.startsWith("socks"));
    });
  });

  describe("uv and Poetry specific scenarios", () => {
    it("should prevent uv from bypassing inspection via inherited NO_PROXY", () => {
      // Simulate environment that uv would receive
      const uvEnv = {
        NO_PROXY: "files.pythonhosted.org,pypi.org",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(uvEnv);

      // uv should not be able to bypass proxy for Python package hosts
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.ok(mergedEnv.HTTPS_PROXY);
      assert.ok(mergedEnv.HTTP_PROXY);
      
      // Verify uv would use Safe Chain proxy
      const proxyUrl = new URL(mergedEnv.HTTPS_PROXY);
      assert.strictEqual(proxyUrl.hostname, "127.0.0.1");
    });

    it("should prevent Poetry from bypassing inspection via inherited HTTP_PROXY", () => {
      // Simulate environment that Poetry would receive
      const poetryEnv = {
        HTTP_PROXY: "http://corporate-proxy.example.com:8080",
        HTTPS_PROXY: "http://corporate-proxy.example.com:8080",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(poetryEnv);

      // Poetry should use Safe Chain proxy, not corporate proxy
      assert.ok(mergedEnv.HTTP_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(mergedEnv.HTTPS_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(!mergedEnv.HTTP_PROXY.includes("corporate-proxy"));
      assert.ok(!mergedEnv.HTTPS_PROXY.includes("corporate-proxy"));
    });

    it("should prevent uvx from using inherited ALL_PROXY", () => {
      // Simulate environment that uvx would receive
      const uvxEnv = {
        ALL_PROXY: "http://alternate-proxy.example.com:3128",
        NO_PROXY: "localhost",
        PATH: "/usr/bin",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(uvxEnv);

      // uvx should use Safe Chain proxy
      assert.ok(mergedEnv.ALL_PROXY.startsWith("http://127.0.0.1:"));
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.ok(!mergedEnv.ALL_PROXY.includes("alternate-proxy"));
    });
  });

  describe("Regression tests for original vulnerability", () => {
    it("should not allow NO_PROXY=* to bypass all inspection", () => {
      // This was the primary exploit: NO_PROXY=* would bypass all proxy inspection
      const exploitEnv = {
        NO_PROXY: "*",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(exploitEnv);

      // The fix: NO_PROXY is explicitly set to empty string
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.strictEqual(mergedEnv.no_proxy, "");
      
      // All traffic must go through Safe Chain proxy
      assert.ok(mergedEnv.HTTPS_PROXY);
      assert.ok(mergedEnv.HTTP_PROXY);
      assert.ok(mergedEnv.ALL_PROXY);
    });

    it("should not allow inherited HTTP_PROXY to route around Safe Chain", () => {
      // This was part of the exploit: inherited HTTP_PROXY could route to different proxy
      const exploitEnv = {
        HTTP_PROXY: "http://attacker-controlled-proxy.example.com:8080",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(exploitEnv);

      // The fix: HTTP_PROXY is explicitly set to Safe Chain proxy
      assert.ok(mergedEnv.HTTP_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(!mergedEnv.HTTP_PROXY.includes("attacker-controlled-proxy"));
    });

    it("should not allow lowercase proxy variables to bypass uppercase checks", () => {
      // This was part of the exploit: lowercase variants could survive when uppercase was absent
      const exploitEnv = {
        http_proxy: "http://bypass.example.com:8080",
        https_proxy: "http://bypass.example.com:8080",
        all_proxy: "http://bypass.example.com:8080",
        no_proxy: "*",
      };

      const mergedEnv = mergeSafeChainProxyEnvironmentVariables(exploitEnv);

      // The fix: Both uppercase and lowercase are explicitly set
      assert.ok(mergedEnv.HTTP_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(mergedEnv.http_proxy.startsWith("http://127.0.0.1:"));
      assert.ok(mergedEnv.HTTPS_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(mergedEnv.https_proxy.startsWith("http://127.0.0.1:"));
      assert.ok(mergedEnv.ALL_PROXY.startsWith("http://127.0.0.1:"));
      assert.ok(mergedEnv.all_proxy.startsWith("http://127.0.0.1:"));
      assert.strictEqual(mergedEnv.NO_PROXY, "");
      assert.strictEqual(mergedEnv.no_proxy, "");
    });
  });
});
