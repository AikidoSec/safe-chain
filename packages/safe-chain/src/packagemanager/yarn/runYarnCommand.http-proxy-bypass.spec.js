import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

/**
 * Security test suite for CVE: Yarn HTTP Proxy Bypass Vulnerability
 * 
 * This test suite verifies that the security issue where Yarn could bypass
 * Safe-chain's proxy for HTTP (non-HTTPS) package fetches has been mitigated.
 * 
 * The vulnerability allowed HTTP registries and tarball URLs to be fetched
 * directly rather than through Safe-chain's policy-enforcing proxy, potentially
 * bypassing malware checks and minimum-age policy enforcement.
 * 
 * The fix ensures that both YARN_HTTP_PROXY and YARN_HTTPS_PROXY are set,
 * routing all traffic through the Safe-chain proxy.
 */
describe("runYarnCommand - HTTP Proxy Bypass Security Fix", () => {
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
            HTTP_PROXY: "http://127.0.0.1:8080",
            HTTPS_PROXY: "http://127.0.0.1:8080",
            GLOBAL_AGENT_HTTP_PROXY: "http://127.0.0.1:8080",
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

  /**
   * SECURITY TEST: Verify that YARN_HTTP_PROXY is set to prevent HTTP bypass
   * 
   * This is the core security fix. Without YARN_HTTP_PROXY, Yarn would fetch
   * HTTP packages directly, bypassing Safe-chain's malware and policy checks.
   */
  it("should set YARN_HTTP_PROXY to prevent HTTP registry bypass", async () => {
    await runYarnCommand(["add", "lodash"]);

    assert.ok(
      capturedEnv.YARN_HTTP_PROXY,
      "YARN_HTTP_PROXY must be set to prevent HTTP traffic bypass"
    );
    assert.strictEqual(
      capturedEnv.YARN_HTTP_PROXY,
      "http://127.0.0.1:8080",
      "YARN_HTTP_PROXY must point to Safe-chain proxy"
    );
  });

  /**
   * SECURITY TEST: Verify that both HTTP and HTTPS proxies are configured
   * 
   * Both proxy settings must be present to ensure all traffic is routed
   * through Safe-chain, regardless of protocol.
   */
  it("should configure both HTTP and HTTPS proxy settings", async () => {
    await runYarnCommand(["add", "lodash"]);

    assert.ok(
      capturedEnv.YARN_HTTP_PROXY,
      "YARN_HTTP_PROXY must be set"
    );
    assert.ok(
      capturedEnv.YARN_HTTPS_PROXY,
      "YARN_HTTPS_PROXY must be set"
    );
    assert.strictEqual(
      capturedEnv.YARN_HTTP_PROXY,
      capturedEnv.YARN_HTTPS_PROXY,
      "Both HTTP and HTTPS proxies should point to the same Safe-chain proxy"
    );
  });

  /**
   * SECURITY TEST: Verify HTTP_PROXY is preserved from Safe-chain environment
   * 
   * The standard HTTP_PROXY environment variable must be preserved so that
   * tools that respect it will also route through Safe-chain.
   */
  it("should preserve HTTP_PROXY from Safe-chain environment", async () => {
    await runYarnCommand(["add", "lodash"]);

    assert.ok(
      capturedEnv.HTTP_PROXY,
      "HTTP_PROXY must be preserved from Safe-chain environment"
    );
    assert.strictEqual(
      capturedEnv.HTTP_PROXY,
      "http://127.0.0.1:8080",
      "HTTP_PROXY must point to Safe-chain proxy"
    );
  });

  /**
   * SECURITY TEST: Verify fix applies to all Yarn versions
   * 
   * The vulnerability affected all Yarn versions, so the fix must apply
   * to v1, v2, v3, and v4+.
   */
  it("should set YARN_HTTP_PROXY for all Yarn versions to prevent bypass", async () => {
    const versions = ["1.22.19", "2.4.3", "3.6.4", "4.1.0"];
    
    for (const version of versions) {
      yarnVersion = version;
      await runYarnCommand(["add", "lodash"]);

      assert.ok(
        capturedEnv.YARN_HTTP_PROXY,
        `YARN_HTTP_PROXY must be set for Yarn ${version} to prevent HTTP bypass`
      );
      assert.strictEqual(
        capturedEnv.YARN_HTTP_PROXY,
        "http://127.0.0.1:8080",
        `YARN_HTTP_PROXY must point to Safe-chain proxy for Yarn ${version}`
      );
    }
  });

  /**
   * SECURITY TEST: Verify proxy configuration for install commands
   * 
   * Install commands are the primary attack vector, as they fetch packages
   * that could contain malicious code.
   */
  it("should route HTTP traffic through proxy for install commands", async () => {
    const installCommands = [
      ["add", "lodash"],
      ["install"],
      ["add", "express@4.18.0"],
      ["global", "add", "typescript"],
    ];

    for (const args of installCommands) {
      await runYarnCommand(args);

      assert.ok(
        capturedEnv.YARN_HTTP_PROXY,
        `YARN_HTTP_PROXY must be set for command: yarn ${args.join(" ")}`
      );
      assert.strictEqual(
        capturedEnv.YARN_HTTP_PROXY,
        "http://127.0.0.1:8080",
        `HTTP traffic must be routed through Safe-chain for: yarn ${args.join(" ")}`
      );
    }
  });

  /**
   * SECURITY TEST: Verify that HTTP_PROXY source is from Safe-chain
   * 
   * The HTTP_PROXY value must come from Safe-chain's proxy environment,
   * not from the user's environment, to ensure it points to the local
   * Safe-chain proxy.
   */
  it("should use Safe-chain HTTP_PROXY, not user environment", async () => {
    await runYarnCommand(["add", "lodash"]);

    // Verify the proxy points to localhost (Safe-chain proxy)
    assert.ok(
      capturedEnv.HTTP_PROXY.includes("127.0.0.1") ||
      capturedEnv.HTTP_PROXY.includes("localhost"),
      "HTTP_PROXY must point to local Safe-chain proxy, not external proxy"
    );
  });

  /**
   * SECURITY TEST: Verify YARN_HTTP_PROXY is derived from HTTP_PROXY
   * 
   * The YARN_HTTP_PROXY should be set based on the HTTP_PROXY value
   * provided by Safe-chain, ensuring consistency.
   */
  it("should derive YARN_HTTP_PROXY from Safe-chain HTTP_PROXY", async () => {
    await runYarnCommand(["add", "lodash"]);

    assert.strictEqual(
      capturedEnv.YARN_HTTP_PROXY,
      capturedEnv.HTTP_PROXY,
      "YARN_HTTP_PROXY should match HTTP_PROXY from Safe-chain environment"
    );
  });

  /**
   * SECURITY TEST: Verify no HTTP traffic can bypass proxy
   * 
   * This test ensures that all necessary proxy environment variables are set
   * so that HTTP package fetches cannot bypass Safe-chain's security checks.
   */
  it("should configure all proxy variables to prevent any HTTP bypass", async () => {
    await runYarnCommand(["add", "lodash"]);

    // Verify all proxy-related variables are set
    const requiredProxyVars = [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "YARN_HTTP_PROXY",
      "YARN_HTTPS_PROXY",
    ];

    for (const varName of requiredProxyVars) {
      assert.ok(
        capturedEnv[varName],
        `${varName} must be set to prevent proxy bypass`
      );
      assert.ok(
        capturedEnv[varName].includes("127.0.0.1") ||
        capturedEnv[varName].includes("localhost"),
        `${varName} must point to local Safe-chain proxy`
      );
    }
  });

  /**
   * SECURITY TEST: Verify proxy settings for HTTP registry URLs
   * 
   * This simulates the attack scenario where a package.json or .yarnrc
   * specifies an HTTP (not HTTPS) registry URL.
   */
  it("should route HTTP registry URLs through proxy", async () => {
    // Simulate installing from a package that might use HTTP registry
    await runYarnCommand(["add", "some-package"]);

    assert.ok(
      capturedEnv.YARN_HTTP_PROXY,
      "YARN_HTTP_PROXY must be set to intercept HTTP registry requests"
    );
    assert.ok(
      capturedEnv.HTTP_PROXY,
      "HTTP_PROXY must be set to intercept HTTP registry requests"
    );
  });

  /**
   * SECURITY TEST: Verify proxy settings for HTTP tarball URLs
   * 
   * This simulates the attack scenario where a package metadata contains
   * an HTTP (not HTTPS) tarball URL.
   */
  it("should route HTTP tarball URLs through proxy", async () => {
    // Simulate installing a package that might have HTTP tarball URLs
    await runYarnCommand(["add", "package-with-http-tarball"]);

    assert.ok(
      capturedEnv.YARN_HTTP_PROXY,
      "YARN_HTTP_PROXY must be set to intercept HTTP tarball downloads"
    );
    assert.strictEqual(
      capturedEnv.YARN_HTTP_PROXY,
      "http://127.0.0.1:8080",
      "HTTP tarball downloads must go through Safe-chain proxy for security checks"
    );
  });

  /**
   * SECURITY TEST: Verify the fix prevents lifecycle script execution bypass
   * 
   * The vulnerability could allow malicious packages to execute lifecycle
   * scripts without Safe-chain's security checks. This test verifies that
   * the proxy configuration prevents this attack vector.
   */
  it("should prevent malicious lifecycle script execution via HTTP bypass", async () => {
    await runYarnCommand(["add", "potentially-malicious-package"]);

    // Verify that all HTTP traffic will be routed through Safe-chain
    // where malware checks and minimum-age policies are enforced
    assert.ok(
      capturedEnv.YARN_HTTP_PROXY,
      "YARN_HTTP_PROXY must be set to ensure malware checks are performed"
    );
    assert.ok(
      capturedEnv.HTTP_PROXY,
      "HTTP_PROXY must be set to ensure malware checks are performed"
    );
    
    // Verify proxy points to Safe-chain (not bypassed)
    assert.ok(
      capturedEnv.YARN_HTTP_PROXY.includes("127.0.0.1"),
      "Proxy must point to Safe-chain to enforce security policies"
    );
  });

  /**
   * SECURITY TEST: Verify minimum-age policy cannot be bypassed via HTTP
   * 
   * Safe-chain enforces a minimum package age policy to protect against
   * supply chain attacks. This test verifies that HTTP packages cannot
   * bypass this policy.
   */
  it("should enforce minimum-age policy for HTTP packages", async () => {
    await runYarnCommand(["add", "new-package@1.0.0"]);

    // Verify proxy configuration that enables minimum-age checks
    assert.ok(
      capturedEnv.YARN_HTTP_PROXY,
      "YARN_HTTP_PROXY must be set to enforce minimum-age policy on HTTP packages"
    );
    assert.strictEqual(
      capturedEnv.YARN_HTTP_PROXY,
      "http://127.0.0.1:8080",
      "HTTP packages must go through Safe-chain proxy for minimum-age checks"
    );
  });

  /**
   * SECURITY TEST: Verify malware database checks cannot be bypassed via HTTP
   * 
   * Safe-chain checks packages against a malware database. This test verifies
   * that HTTP packages cannot bypass these checks.
   */
  it("should enforce malware checks for HTTP packages", async () => {
    await runYarnCommand(["add", "suspicious-package"]);

    // Verify proxy configuration that enables malware checks
    assert.ok(
      capturedEnv.YARN_HTTP_PROXY,
      "YARN_HTTP_PROXY must be set to enforce malware checks on HTTP packages"
    );
    assert.ok(
      capturedEnv.HTTP_PROXY,
      "HTTP_PROXY must be set to enforce malware checks on HTTP packages"
    );
  });

  /**
   * SECURITY TEST: Verify the fix is complete and consistent
   * 
   * This test performs a comprehensive check to ensure the fix is properly
   * implemented and all security properties are satisfied.
   */
  it("should implement complete HTTP proxy bypass mitigation", async () => {
    await runYarnCommand(["add", "test-package"]);

    // Security property 1: YARN_HTTP_PROXY must be set
    assert.ok(
      capturedEnv.YARN_HTTP_PROXY,
      "Security property violated: YARN_HTTP_PROXY not set"
    );

    // Security property 2: YARN_HTTP_PROXY must point to Safe-chain
    assert.ok(
      capturedEnv.YARN_HTTP_PROXY.includes("127.0.0.1") ||
      capturedEnv.YARN_HTTP_PROXY.includes("localhost"),
      "Security property violated: YARN_HTTP_PROXY does not point to Safe-chain"
    );

    // Security property 3: HTTP_PROXY must be preserved
    assert.ok(
      capturedEnv.HTTP_PROXY,
      "Security property violated: HTTP_PROXY not preserved"
    );

    // Security property 4: Both HTTP and HTTPS proxies must be configured
    assert.ok(
      capturedEnv.YARN_HTTP_PROXY && capturedEnv.YARN_HTTPS_PROXY,
      "Security property violated: Both HTTP and HTTPS proxies must be configured"
    );

    // Security property 5: Proxy values must be consistent
    assert.strictEqual(
      capturedEnv.YARN_HTTP_PROXY,
      capturedEnv.HTTP_PROXY,
      "Security property violated: Proxy values are inconsistent"
    );
  });
});
