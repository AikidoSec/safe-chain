import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

let configFileContent = undefined;
mock.module("fs", {
  namedExports: {
    existsSync: () => configFileContent !== undefined,
    readFileSync: () => configFileContent,
    writeFileSync: (content) => (configFileContent = content),
    mkdirSync: () => {},
  },
});

describe("getNpmCustomRegistries", async () => {
  let originalEnv;
  const { getNpmCustomRegistries } = await import("./settings.js");

  beforeEach(() => {
    originalEnv = process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES = originalEnv;
    } else {
      delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    }
    configFileContent = undefined;
  });

  it("should return empty array when no registries configured", () => {
    configFileContent = undefined;

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, []);
  });

  it("should return registries without protocol", () => {
    configFileContent = JSON.stringify({
      npm: {
        customRegistries: ["npm.company.com", "registry.internal.net"],
      },
    });

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "npm.company.com",
      "registry.internal.net",
    ]);
  });

  it("should strip https:// protocol from registries", () => {
    configFileContent = JSON.stringify({
      npm: {
        customRegistries: [
          "https://npm.company.com",
          "https://registry.internal.net",
        ],
      },
    });

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "npm.company.com",
      "registry.internal.net",
    ]);
  });

  it("should strip http:// protocol from registries", () => {
    configFileContent = JSON.stringify({
      npm: {
        customRegistries: [
          "http://npm.company.com",
          "http://registry.internal.net",
        ],
      },
    });

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "npm.company.com",
      "registry.internal.net",
    ]);
  });

  it("should handle mixed protocols and no protocol", () => {
    configFileContent = JSON.stringify({
      npm: {
        customRegistries: [
          "https://npm.company.com",
          "registry.internal.net",
          "http://private.registry.io",
        ],
      },
    });

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "npm.company.com",
      "registry.internal.net",
      "private.registry.io",
    ]);
  });

  it("should preserve registry path after stripping protocol", () => {
    configFileContent = JSON.stringify({
      npm: {
        customRegistries: [
          "https://npm.company.com/custom/path",
          "registry.internal.net/npm",
        ],
      },
    });

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "npm.company.com/custom/path",
      "registry.internal.net/npm",
    ]);
  });

  it("should parse comma-separated registries from environment variable", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES =
      "env1.registry.com,env2.registry.net";
    configFileContent = undefined;

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "env1.registry.com",
      "env2.registry.net",
    ]);
  });

  it("should trim whitespace from environment variable registries", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES =
      "  env1.registry.com  ,  env2.registry.net  ";
    configFileContent = undefined;

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "env1.registry.com",
      "env2.registry.net",
    ]);
  });

  it("should merge environment variable and config file registries", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES = "env1.registry.com";
    configFileContent = JSON.stringify({
      npm: {
        customRegistries: ["config1.registry.net"],
      },
    });

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "env1.registry.com",
      "config1.registry.net",
    ]);
  });

  it("should remove duplicate registries when merging env and config", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES =
      "npm.company.com,env.registry.com";
    configFileContent = JSON.stringify({
      npm: {
        customRegistries: ["npm.company.com", "config.registry.net"],
      },
    });

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "npm.company.com",
      "env.registry.com",
      "config.registry.net",
    ]);
  });

  it("should normalize protocols from environment variable registries", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES =
      "https://env1.registry.com,http://env2.registry.net";
    configFileContent = undefined;

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "env1.registry.com",
      "env2.registry.net",
    ]);
  });

  it("should handle empty strings in comma-separated list", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES =
      "env1.registry.com,,env2.registry.net,";
    configFileContent = undefined;

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, [
      "env1.registry.com",
      "env2.registry.net",
    ]);
  });

  it("should handle single registry in environment variable", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES = "single.registry.com";
    configFileContent = undefined;

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, ["single.registry.com"]);
  });

  it("should return empty array for empty environment variable", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES = "";
    configFileContent = undefined;

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, []);
  });

  it("should return empty array for whitespace-only environment variable", () => {
    delete process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
    process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES = "   ,  ,  ";
    configFileContent = undefined;

    const registries = getNpmCustomRegistries();

    assert.deepStrictEqual(registries, []);
  });
});
