import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { npmInterceptorForUrl } from "./npmInterceptor.js";

describe("npmInterceptor", () => {
  afterEach(() => {
    delete process.env.SAFE_CHAIN_CUSTOM_NPM_REGISTRIES;
  });

  it("Should recognize known registries", () => {
    const npmUrl = "https://registry.npmjs.org/lodash";
    const interceptor = npmInterceptorForUrl(npmUrl);

    assert.ok(interceptor !== undefined, "Interceptor should be created for npm registry");
  });

  it("Should recognize yarn registry", () => {
    const yarnUrl = "https://registry.yarnpkg.com/lodash";
    const interceptor = npmInterceptorForUrl(yarnUrl);

    assert.ok(interceptor !== undefined, "Interceptor should be created for yarn registry");
  });

  it("Should recognize custom registries from SAFE_CHAIN_CUSTOM_NPM_REGISTRIES environment variable", () => {
    process.env.SAFE_CHAIN_CUSTOM_NPM_REGISTRIES = "registry.example.com,registry.custom.org";

    const customRegistryUrl = "https://registry.example.com/lodash";
    const interceptor = npmInterceptorForUrl(customRegistryUrl);

    assert.ok(interceptor !== undefined, "Interceptor should be created for custom registry");
  });

  it("Should recognize multiple custom registries", () => {
    process.env.SAFE_CHAIN_CUSTOM_NPM_REGISTRIES = "registry.example.com,registry.custom.org";

    const secondCustomUrl = "https://registry.custom.org/lodash";
    const interceptor = npmInterceptorForUrl(secondCustomUrl);

    assert.ok(interceptor !== undefined, "Interceptor should be created for second custom registry");
  });

  it("Should not recognize registries not in the allowed list", () => {
    process.env.SAFE_CHAIN_CUSTOM_NPM_REGISTRIES = "registry.example.com";

    const unknownRegistryUrl = "https://registry.unknown.com/lodash";
    const interceptor = npmInterceptorForUrl(unknownRegistryUrl);

    assert.equal(interceptor, undefined, "Interceptor should not be created for unknown registry");
  });

  it("Should handle whitespace in custom registries", () => {
    process.env.SAFE_CHAIN_CUSTOM_NPM_REGISTRIES = "registry.example.com , registry.custom.org";

    const customRegistryUrl = "https://registry.custom.org/lodash";
    const interceptor = npmInterceptorForUrl(customRegistryUrl);

    assert.ok(interceptor !== undefined, "Interceptor should be created after trimming whitespace");
  });
});
