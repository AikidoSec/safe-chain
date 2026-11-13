import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import {
  createSafeChainProxy,
  mergeSafeChainProxyEnvironmentVariables,
} from "./registryProxy.js";

/**
 * Security test suite for registryProxy HTTP_PROXY configuration
 * 
 * This test suite verifies that the registryProxy properly sets HTTP_PROXY
 * in addition to HTTPS_PROXY, ensuring that HTTP package fetches are routed
 * through Safe-chain's security-enforcing proxy.
 * 
 * This is part of the fix for the Yarn HTTP Proxy Bypass vulnerability.
 */
describe("registryProxy - HTTP_PROXY Security Configuration", () => {
  let proxy;

  before(async () => {
    // Start the proxy server so environment variables are available
    proxy = createSafeChainProxy();
    await proxy.startServer();
  });

  after(async () => {
    if (proxy) {
      await proxy.stopServer();
    }
  });
  /**
   * SECURITY TEST: Verify HTTP_PROXY is included in proxy environment
   * 
   * The registryProxy must provide HTTP_PROXY so that package managers
   * can route HTTP traffic through Safe-chain's proxy.
   */
  it("should include HTTP_PROXY in proxy environment variables", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    assert.ok(
      env.HTTP_PROXY,
      "HTTP_PROXY must be set to route HTTP traffic through Safe-chain"
    );
  });

  /**
   * SECURITY TEST: Verify HTTP_PROXY points to Safe-chain proxy
   * 
   * The HTTP_PROXY must point to the local Safe-chain proxy, not an
   * external proxy that could bypass security checks.
   */
  it("should set HTTP_PROXY to Safe-chain proxy URL", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    assert.ok(
      env.HTTP_PROXY,
      "HTTP_PROXY must be set"
    );
    assert.ok(
      env.HTTP_PROXY.includes("127.0.0.1") ||
      env.HTTP_PROXY.includes("localhost"),
      "HTTP_PROXY must point to local Safe-chain proxy"
    );
    assert.ok(
      env.HTTP_PROXY.startsWith("http://"),
      "HTTP_PROXY must be an HTTP URL"
    );
  });

  /**
   * SECURITY TEST: Verify both HTTP and HTTPS proxies are configured
   * 
   * Both HTTP_PROXY and HTTPS_PROXY must be set to ensure all traffic
   * is routed through Safe-chain, regardless of protocol.
   */
  it("should configure both HTTP_PROXY and HTTPS_PROXY", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    assert.ok(
      env.HTTP_PROXY,
      "HTTP_PROXY must be set"
    );
    assert.ok(
      env.HTTPS_PROXY,
      "HTTPS_PROXY must be set"
    );
  });

  /**
   * SECURITY TEST: Verify HTTP and HTTPS proxies point to same endpoint
   * 
   * Both proxies should point to the same Safe-chain proxy endpoint
   * to ensure consistent security policy enforcement.
   */
  it("should set HTTP_PROXY and HTTPS_PROXY to the same Safe-chain proxy", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    assert.strictEqual(
      env.HTTP_PROXY,
      env.HTTPS_PROXY,
      "HTTP_PROXY and HTTPS_PROXY should point to the same Safe-chain proxy"
    );
  });

  /**
   * SECURITY TEST: Verify proxy configuration is complete
   * 
   * All necessary proxy environment variables must be set to prevent
   * any traffic from bypassing Safe-chain.
   */
  it("should provide complete proxy configuration", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    const requiredVars = [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "GLOBAL_AGENT_HTTP_PROXY",
      "NODE_EXTRA_CA_CERTS",
    ];

    for (const varName of requiredVars) {
      assert.ok(
        env[varName],
        `${varName} must be set for complete proxy configuration`
      );
    }
  });

  /**
   * SECURITY TEST: Verify HTTP_PROXY is not overridden by user environment
   * 
   * Safe-chain's HTTP_PROXY should take precedence over any user-provided
   * HTTP_PROXY to ensure traffic goes through Safe-chain's security checks.
   */
  it("should override user HTTP_PROXY with Safe-chain proxy", () => {
    const userEnv = {
      HTTP_PROXY: "http://user-proxy.example.com:8080",
      HTTPS_PROXY: "http://user-proxy.example.com:8080",
    };

    const env = mergeSafeChainProxyEnvironmentVariables(userEnv);

    assert.ok(
      env.HTTP_PROXY,
      "HTTP_PROXY must be set"
    );
    assert.notStrictEqual(
      env.HTTP_PROXY,
      userEnv.HTTP_PROXY,
      "Safe-chain HTTP_PROXY should override user HTTP_PROXY"
    );
    assert.ok(
      env.HTTP_PROXY.includes("127.0.0.1") ||
      env.HTTP_PROXY.includes("localhost"),
      "HTTP_PROXY must point to Safe-chain proxy, not user proxy"
    );
  });

  /**
   * SECURITY TEST: Verify case-insensitive proxy variable handling
   * 
   * Environment variables can be case-insensitive on some systems.
   * Safe-chain must handle http_proxy, HTTP_PROXY, etc. correctly.
   */
  it("should handle case variations of HTTP_PROXY correctly", () => {
    const userEnv = {
      http_proxy: "http://user-proxy.example.com:8080",
      https_proxy: "http://user-proxy.example.com:8080",
    };

    const env = mergeSafeChainProxyEnvironmentVariables(userEnv);

    // Safe-chain should set uppercase HTTP_PROXY
    assert.ok(
      env.HTTP_PROXY,
      "HTTP_PROXY (uppercase) must be set by Safe-chain"
    );
    assert.ok(
      env.HTTP_PROXY.includes("127.0.0.1") ||
      env.HTTP_PROXY.includes("localhost"),
      "HTTP_PROXY must point to Safe-chain proxy"
    );
  });

  /**
   * SECURITY TEST: Verify proxy configuration prevents HTTP bypass
   * 
   * This test verifies that the proxy configuration is sufficient to
   * prevent HTTP traffic from bypassing Safe-chain's security checks.
   */
  it("should configure proxies to prevent HTTP traffic bypass", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    // Verify HTTP_PROXY is set (primary defense)
    assert.ok(
      env.HTTP_PROXY,
      "HTTP_PROXY must be set to prevent HTTP bypass"
    );

    // Verify it points to Safe-chain
    assert.ok(
      env.HTTP_PROXY.includes("127.0.0.1") ||
      env.HTTP_PROXY.includes("localhost"),
      "HTTP_PROXY must point to Safe-chain to enforce security policies"
    );

    // Verify HTTPS_PROXY is also set (defense in depth)
    assert.ok(
      env.HTTPS_PROXY,
      "HTTPS_PROXY must be set for complete coverage"
    );

    // Verify consistency
    assert.strictEqual(
      env.HTTP_PROXY,
      env.HTTPS_PROXY,
      "HTTP and HTTPS proxies must be consistent"
    );
  });

  /**
   * SECURITY TEST: Verify GLOBAL_AGENT_HTTP_PROXY is set
   * 
   * Some Node.js HTTP clients use GLOBAL_AGENT_HTTP_PROXY, so it must
   * also be set to ensure comprehensive coverage.
   */
  it("should set GLOBAL_AGENT_HTTP_PROXY for Node.js HTTP clients", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    assert.ok(
      env.GLOBAL_AGENT_HTTP_PROXY,
      "GLOBAL_AGENT_HTTP_PROXY must be set for Node.js HTTP clients"
    );
    assert.ok(
      env.GLOBAL_AGENT_HTTP_PROXY.includes("127.0.0.1") ||
      env.GLOBAL_AGENT_HTTP_PROXY.includes("localhost"),
      "GLOBAL_AGENT_HTTP_PROXY must point to Safe-chain proxy"
    );
  });

  /**
   * SECURITY TEST: Verify all proxy variables point to same endpoint
   * 
   * All proxy-related environment variables should point to the same
   * Safe-chain proxy endpoint for consistency.
   */
  it("should set all proxy variables to the same Safe-chain endpoint", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    const proxyVars = [
      env.HTTP_PROXY,
      env.HTTPS_PROXY,
      env.GLOBAL_AGENT_HTTP_PROXY,
    ];

    // All should be defined
    for (const proxyVar of proxyVars) {
      assert.ok(proxyVar, "All proxy variables must be defined");
    }

    // All should point to the same endpoint
    const firstProxy = proxyVars[0];
    for (const proxyVar of proxyVars) {
      assert.strictEqual(
        proxyVar,
        firstProxy,
        "All proxy variables should point to the same Safe-chain endpoint"
      );
    }
  });

  /**
   * SECURITY TEST: Verify proxy URL format is correct
   * 
   * The proxy URL must be properly formatted to be recognized by
   * HTTP clients.
   */
  it("should provide properly formatted proxy URLs", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    // Verify HTTP_PROXY format
    assert.ok(
      env.HTTP_PROXY.startsWith("http://"),
      "HTTP_PROXY must start with http://"
    );
    assert.ok(
      /^http:\/\/127\.0\.0\.1:\d+$/.test(env.HTTP_PROXY) ||
      /^http:\/\/localhost:\d+$/.test(env.HTTP_PROXY),
      "HTTP_PROXY must be in format http://127.0.0.1:port or http://localhost:port"
    );

    // Verify HTTPS_PROXY format
    assert.ok(
      env.HTTPS_PROXY.startsWith("http://"),
      "HTTPS_PROXY must start with http:// (proxy endpoint is HTTP)"
    );
  });

  /**
   * SECURITY TEST: Verify CA certificate configuration
   * 
   * NODE_EXTRA_CA_CERTS must be set to allow Safe-chain's MITM proxy
   * to intercept HTTPS traffic for security checks.
   */
  it("should configure NODE_EXTRA_CA_CERTS for HTTPS interception", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    assert.ok(
      env.NODE_EXTRA_CA_CERTS,
      "NODE_EXTRA_CA_CERTS must be set for HTTPS interception"
    );
    assert.ok(
      typeof env.NODE_EXTRA_CA_CERTS === "string" &&
      env.NODE_EXTRA_CA_CERTS.length > 0,
      "NODE_EXTRA_CA_CERTS must be a non-empty string path"
    );
  });

  /**
   * SECURITY TEST: Verify empty environment is handled correctly
   * 
   * Even with an empty input environment, Safe-chain must provide
   * complete proxy configuration.
   */
  it("should provide complete proxy configuration even with empty input", () => {
    const env = mergeSafeChainProxyEnvironmentVariables({});

    assert.ok(env.HTTP_PROXY, "HTTP_PROXY must be set");
    assert.ok(env.HTTPS_PROXY, "HTTPS_PROXY must be set");
    assert.ok(env.GLOBAL_AGENT_HTTP_PROXY, "GLOBAL_AGENT_HTTP_PROXY must be set");
    assert.ok(env.NODE_EXTRA_CA_CERTS, "NODE_EXTRA_CA_CERTS must be set");
  });

  /**
   * SECURITY TEST: Verify non-proxy environment variables are preserved
   * 
   * While overriding proxy settings, Safe-chain must preserve other
   * environment variables.
   */
  it("should preserve non-proxy environment variables", () => {
    const userEnv = {
      PATH: "/usr/bin:/bin",
      HOME: "/home/user",
      USER: "testuser",
      CUSTOM_VAR: "custom_value",
    };

    const env = mergeSafeChainProxyEnvironmentVariables(userEnv);

    // Verify non-proxy variables are preserved
    assert.strictEqual(env.PATH, userEnv.PATH, "PATH should be preserved");
    assert.strictEqual(env.HOME, userEnv.HOME, "HOME should be preserved");
    assert.strictEqual(env.USER, userEnv.USER, "USER should be preserved");
    assert.strictEqual(
      env.CUSTOM_VAR,
      userEnv.CUSTOM_VAR,
      "Custom variables should be preserved"
    );

    // Verify proxy variables are set by Safe-chain
    assert.ok(env.HTTP_PROXY, "HTTP_PROXY should be set by Safe-chain");
    assert.ok(env.HTTPS_PROXY, "HTTPS_PROXY should be set by Safe-chain");
  });
});
