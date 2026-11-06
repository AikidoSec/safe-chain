import { before, after, describe, it } from "node:test";
import assert from "node:assert";
import {
  createSafeChainProxy,
  mergeSafeChainProxyEnvironmentVariables,
} from "./registryProxy.js";

/**
 * Test suite for HTTP_PROXY enforcement fix
 * 
 * This test suite verifies that the security vulnerability where HTTP package
 * downloads could bypass Safe Chain proxy enforcement has been mitigated.
 * 
 * The vulnerability occurred because getSafeChainProxyEnvironmentVariables()
 * only set HTTPS_PROXY and GLOBAL_AGENT_HTTP_PROXY, but not HTTP_PROXY.
 * This allowed HTTP package requests to bypass Safe Chain's inspection proxy.
 * 
 * The fix adds HTTP_PROXY to the proxy environment variables, ensuring that
 * both HTTP and HTTPS traffic from Bun, PDM, and pipx are routed through
 * Safe Chain's inspection proxy.
 */
describe("registryProxy HTTP_PROXY enforcement", () => {
  let proxy;

  before(async () => {
    proxy = createSafeChainProxy();
    await proxy.startServer();
  });

  after(async () => {
    await proxy.stopServer();
  });

  it("should set HTTP_PROXY in proxy environment variables", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // Verify HTTP_PROXY is set
    assert.ok(envVars.HTTP_PROXY, "HTTP_PROXY should be set");
    assert.ok(
      envVars.HTTP_PROXY.startsWith("http://127.0.0.1:"),
      "HTTP_PROXY should point to loopback address"
    );
  });

  it("should set HTTPS_PROXY in proxy environment variables", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // Verify HTTPS_PROXY is set
    assert.ok(envVars.HTTPS_PROXY, "HTTPS_PROXY should be set");
    assert.ok(
      envVars.HTTPS_PROXY.startsWith("http://127.0.0.1:"),
      "HTTPS_PROXY should point to loopback address"
    );
  });

  it("should set HTTP_PROXY and HTTPS_PROXY to the same proxy URL", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // Both should point to the same Safe Chain proxy
    assert.strictEqual(
      envVars.HTTP_PROXY,
      envVars.HTTPS_PROXY,
      "HTTP_PROXY and HTTPS_PROXY should be identical"
    );
  });

  it("should set GLOBAL_AGENT_HTTP_PROXY to the same proxy URL", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // GLOBAL_AGENT_HTTP_PROXY should also point to the same proxy
    assert.strictEqual(
      envVars.HTTP_PROXY,
      envVars.GLOBAL_AGENT_HTTP_PROXY,
      "HTTP_PROXY and GLOBAL_AGENT_HTTP_PROXY should be identical"
    );
  });

  it("should not allow inherited HTTP_PROXY to override Safe Chain proxy", () => {
    const inheritedEnv = {
      HTTP_PROXY: "http://malicious-proxy.example.com:8080",
      OTHER_VAR: "keep-me",
    };
    
    const envVars = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);
    
    // Safe Chain's HTTP_PROXY should override inherited value
    assert.ok(
      envVars.HTTP_PROXY.startsWith("http://127.0.0.1:"),
      "HTTP_PROXY should be Safe Chain proxy, not inherited value"
    );
    assert.notStrictEqual(
      envVars.HTTP_PROXY,
      "http://malicious-proxy.example.com:8080",
      "Inherited HTTP_PROXY should be overridden"
    );
    
    // Other variables should be preserved
    assert.strictEqual(envVars.OTHER_VAR, "keep-me");
  });

  it("should not allow inherited http_proxy (lowercase) to override Safe Chain proxy", () => {
    const inheritedEnv = {
      http_proxy: "http://malicious-proxy.example.com:8080",
      OTHER_VAR: "keep-me",
    };
    
    const envVars = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);
    
    // Safe Chain's HTTP_PROXY should be set (uppercase)
    assert.ok(
      envVars.HTTP_PROXY.startsWith("http://127.0.0.1:"),
      "HTTP_PROXY should be Safe Chain proxy"
    );
    
    // Lowercase http_proxy should not be present in the merged environment
    // because the merge logic checks uppercase keys
    assert.strictEqual(
      envVars.http_proxy,
      undefined,
      "Lowercase http_proxy should not be copied when HTTP_PROXY is set"
    );
  });

  it("should not allow inherited HTTPS_PROXY to override Safe Chain proxy", () => {
    const inheritedEnv = {
      HTTPS_PROXY: "http://malicious-proxy.example.com:8080",
    };
    
    const envVars = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);
    
    // Safe Chain's HTTPS_PROXY should override inherited value
    assert.ok(
      envVars.HTTPS_PROXY.startsWith("http://127.0.0.1:"),
      "HTTPS_PROXY should be Safe Chain proxy, not inherited value"
    );
    assert.notStrictEqual(
      envVars.HTTPS_PROXY,
      "http://malicious-proxy.example.com:8080",
      "Inherited HTTPS_PROXY should be overridden"
    );
  });

  it("should not allow inherited https_proxy (lowercase) to override Safe Chain proxy", () => {
    const inheritedEnv = {
      https_proxy: "http://malicious-proxy.example.com:8080",
    };
    
    const envVars = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);
    
    // Safe Chain's HTTPS_PROXY should be set (uppercase)
    assert.ok(
      envVars.HTTPS_PROXY.startsWith("http://127.0.0.1:"),
      "HTTPS_PROXY should be Safe Chain proxy"
    );
    
    // Lowercase https_proxy should not be present
    assert.strictEqual(
      envVars.https_proxy,
      undefined,
      "Lowercase https_proxy should not be copied when HTTPS_PROXY is set"
    );
  });

  it("should handle mixed case proxy variables correctly", () => {
    const inheritedEnv = {
      HTTP_PROXY: "http://bad-proxy-1.example.com:8080",
      http_proxy: "http://bad-proxy-2.example.com:8080",
      HTTPS_PROXY: "http://bad-proxy-3.example.com:8080",
      https_proxy: "http://bad-proxy-4.example.com:8080",
      SOME_OTHER_VAR: "preserve-me",
    };
    
    const envVars = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);
    
    // All proxy variables should point to Safe Chain proxy
    assert.ok(
      envVars.HTTP_PROXY.startsWith("http://127.0.0.1:"),
      "HTTP_PROXY should be Safe Chain proxy"
    );
    assert.ok(
      envVars.HTTPS_PROXY.startsWith("http://127.0.0.1:"),
      "HTTPS_PROXY should be Safe Chain proxy"
    );
    
    // Lowercase variants should not be present
    assert.strictEqual(envVars.http_proxy, undefined);
    assert.strictEqual(envVars.https_proxy, undefined);
    
    // Other variables should be preserved
    assert.strictEqual(envVars.SOME_OTHER_VAR, "preserve-me");
  });

  it("should preserve non-proxy environment variables", () => {
    const inheritedEnv = {
      PATH: "/usr/bin:/bin",
      HOME: "/home/user",
      USER: "testuser",
      CUSTOM_VAR: "custom-value",
    };
    
    const envVars = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);
    
    // All non-proxy variables should be preserved
    assert.strictEqual(envVars.PATH, "/usr/bin:/bin");
    assert.strictEqual(envVars.HOME, "/home/user");
    assert.strictEqual(envVars.USER, "testuser");
    assert.strictEqual(envVars.CUSTOM_VAR, "custom-value");
    
    // Proxy variables should be set
    assert.ok(envVars.HTTP_PROXY);
    assert.ok(envVars.HTTPS_PROXY);
  });

  it("should set NODE_EXTRA_CA_CERTS for certificate validation", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // Verify NODE_EXTRA_CA_CERTS is set
    assert.ok(
      envVars.NODE_EXTRA_CA_CERTS,
      "NODE_EXTRA_CA_CERTS should be set"
    );
    assert.ok(
      typeof envVars.NODE_EXTRA_CA_CERTS === "string",
      "NODE_EXTRA_CA_CERTS should be a string path"
    );
  });

  it("should return all required proxy environment variables for Bun", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // Bun needs HTTP_PROXY and HTTPS_PROXY to route all traffic through proxy
    assert.ok(envVars.HTTP_PROXY, "HTTP_PROXY required for Bun HTTP requests");
    assert.ok(envVars.HTTPS_PROXY, "HTTPS_PROXY required for Bun HTTPS requests");
    assert.ok(envVars.NODE_EXTRA_CA_CERTS, "NODE_EXTRA_CA_CERTS required for certificate validation");
  });

  it("should return all required proxy environment variables for PDM", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // PDM uses httpx which respects HTTP_PROXY and HTTPS_PROXY
    assert.ok(envVars.HTTP_PROXY, "HTTP_PROXY required for PDM HTTP requests");
    assert.ok(envVars.HTTPS_PROXY, "HTTPS_PROXY required for PDM HTTPS requests");
  });

  it("should return all required proxy environment variables for pipx", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // pipx respects HTTP_PROXY and HTTPS_PROXY for package downloads
    assert.ok(envVars.HTTP_PROXY, "HTTP_PROXY required for pipx HTTP requests");
    assert.ok(envVars.HTTPS_PROXY, "HTTPS_PROXY required for pipx HTTPS requests");
  });

  it("should ensure HTTP and HTTPS traffic use the same inspection proxy", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // Parse the proxy URLs
    const httpProxyUrl = new URL(envVars.HTTP_PROXY);
    const httpsProxyUrl = new URL(envVars.HTTPS_PROXY);
    
    // Both should point to the same host and port
    assert.strictEqual(
      httpProxyUrl.hostname,
      httpsProxyUrl.hostname,
      "HTTP and HTTPS proxies should use same hostname"
    );
    assert.strictEqual(
      httpProxyUrl.port,
      httpsProxyUrl.port,
      "HTTP and HTTPS proxies should use same port"
    );
    
    // Both should be loopback addresses
    assert.strictEqual(httpProxyUrl.hostname, "127.0.0.1");
    assert.strictEqual(httpsProxyUrl.hostname, "127.0.0.1");
  });

  it("should prevent HTTP package downloads from bypassing inspection", () => {
    // This test verifies the core security property:
    // HTTP_PROXY must be set to ensure HTTP package requests are inspected
    
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // HTTP_PROXY must be present and point to Safe Chain proxy
    assert.ok(
      envVars.HTTP_PROXY,
      "HTTP_PROXY must be set to prevent bypass"
    );
    
    const proxyUrl = new URL(envVars.HTTP_PROXY);
    
    // Must be loopback to ensure it's the Safe Chain proxy
    assert.strictEqual(
      proxyUrl.hostname,
      "127.0.0.1",
      "HTTP_PROXY must point to loopback Safe Chain proxy"
    );
    
    // Must have a valid port
    assert.ok(
      proxyUrl.port && parseInt(proxyUrl.port) > 0,
      "HTTP_PROXY must have a valid port"
    );
  });

  it("should prevent HTTPS package downloads from bypassing inspection", () => {
    // This test verifies the core security property:
    // HTTPS_PROXY must be set to ensure HTTPS package requests are inspected
    
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // HTTPS_PROXY must be present and point to Safe Chain proxy
    assert.ok(
      envVars.HTTPS_PROXY,
      "HTTPS_PROXY must be set to prevent bypass"
    );
    
    const proxyUrl = new URL(envVars.HTTPS_PROXY);
    
    // Must be loopback to ensure it's the Safe Chain proxy
    assert.strictEqual(
      proxyUrl.hostname,
      "127.0.0.1",
      "HTTPS_PROXY must point to loopback Safe Chain proxy"
    );
    
    // Must have a valid port
    assert.ok(
      proxyUrl.port && parseInt(proxyUrl.port) > 0,
      "HTTPS_PROXY must have a valid port"
    );
  });

  it("should return proxy variables when proxy server is running", async () => {
    // Verify proxy is running and returns proxy variables
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // When proxy is running, should set proxy variables
    assert.ok(
      envVars.HTTP_PROXY,
      "HTTP_PROXY should be set when proxy is running"
    );
    assert.ok(
      envVars.HTTPS_PROXY,
      "HTTPS_PROXY should be set when proxy is running"
    );
    
    // Both should point to loopback
    assert.ok(envVars.HTTP_PROXY.startsWith("http://127.0.0.1:"));
    assert.ok(envVars.HTTPS_PROXY.startsWith("http://127.0.0.1:"));
  });

  it("should handle empty inherited environment", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // Should still set all required proxy variables
    assert.ok(envVars.HTTP_PROXY);
    assert.ok(envVars.HTTPS_PROXY);
    assert.ok(envVars.GLOBAL_AGENT_HTTP_PROXY);
    assert.ok(envVars.NODE_EXTRA_CA_CERTS);
  });

  it("should handle undefined values in inherited environment", () => {
    const inheritedEnv = {
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      SOME_VAR: "value",
    };
    
    const envVars = mergeSafeChainProxyEnvironmentVariables(inheritedEnv);
    
    // Safe Chain proxy variables should be set
    assert.ok(envVars.HTTP_PROXY);
    assert.ok(envVars.HTTPS_PROXY);
    
    // Defined variables should be preserved
    assert.strictEqual(envVars.SOME_VAR, "value");
  });

  it("should enforce proxy for all package manager HTTP traffic", () => {
    // This test verifies that the fix ensures all HTTP traffic from
    // Bun, PDM, and pipx will be routed through the Safe Chain proxy
    
    const envVars = mergeSafeChainProxyEnvironmentVariables({});
    
    // All three proxy variables must be set and identical
    assert.ok(envVars.HTTP_PROXY, "HTTP_PROXY must be set");
    assert.ok(envVars.HTTPS_PROXY, "HTTPS_PROXY must be set");
    assert.ok(envVars.GLOBAL_AGENT_HTTP_PROXY, "GLOBAL_AGENT_HTTP_PROXY must be set");
    
    // All must point to the same Safe Chain proxy
    assert.strictEqual(envVars.HTTP_PROXY, envVars.HTTPS_PROXY);
    assert.strictEqual(envVars.HTTP_PROXY, envVars.GLOBAL_AGENT_HTTP_PROXY);
    
    // All must be loopback addresses
    const httpProxy = new URL(envVars.HTTP_PROXY);
    const httpsProxy = new URL(envVars.HTTPS_PROXY);
    const globalAgentProxy = new URL(envVars.GLOBAL_AGENT_HTTP_PROXY);
    
    assert.strictEqual(httpProxy.hostname, "127.0.0.1");
    assert.strictEqual(httpsProxy.hostname, "127.0.0.1");
    assert.strictEqual(globalAgentProxy.hostname, "127.0.0.1");
  });
});
