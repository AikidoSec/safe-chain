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

const {
  getNpmCustomRegistries,
  getPipCustomRegistries,
  getNpmMinimumPackageAgeExclusions,
  getLoggingLevel,
  LOGGING_SILENT,
  LOGGING_NORMAL,
  LOGGING_VERBOSE,
} = await import("./settings.js");
const { initializeCliArguments } = await import("./cliArguments.js");

for (const { packageManager, getCustomRegistries, envVarName } of [
  {
    packageManager: "npm",
    getCustomRegistries: getNpmCustomRegistries,
    envVarName: "SAFE_CHAIN_NPM_CUSTOM_REGISTRIES",
  },
  {
    packageManager: "pip",
    getCustomRegistries: getPipCustomRegistries,
    envVarName: "SAFE_CHAIN_PIP_CUSTOM_REGISTRIES",
  },
]) {
  describe(getCustomRegistries.name, async () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env[envVarName];
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env[envVarName] = originalEnv;
      } else {
        delete process.env[envVarName];
      }
      configFileContent = undefined;
    });

    it("should return empty array when no registries configured", () => {
      configFileContent = undefined;

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, []);
    });

    it("should return registries without protocol", () => {
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: [
            `${packageManager}.company.com`,
            "registry.internal.net",
          ],
        },
      });

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com`,
        "registry.internal.net",
      ]);
    });

    it("should strip https:// protocol from registries", () => {
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: [
            `https://${packageManager}.company.com`,
            "https://registry.internal.net",
          ],
        },
      });

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com`,
        "registry.internal.net",
      ]);
    });

    it("should strip http:// protocol from registries", () => {
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: [
            `http://${packageManager}.company.com`,
            "http://registry.internal.net",
          ],
        },
      });

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com`,
        "registry.internal.net",
      ]);
    });

    it("should handle mixed protocols and no protocol", () => {
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: [
            `https://${packageManager}.company.com`,
            "registry.internal.net",
            "http://private.registry.io",
          ],
        },
      });

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com`,
        "registry.internal.net",
        "private.registry.io",
      ]);
    });

    it("should preserve registry path after stripping protocol", () => {
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: [
            `https://${packageManager}.company.com/custom/path`,
            `registry.internal.net/${packageManager}`,
          ],
        },
      });

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com/custom/path`,
        `registry.internal.net/${packageManager}`,
      ]);
    });

    it("should parse comma-separated registries from environment variable", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "env1.registry.com,env2.registry.net";
      configFileContent = undefined;

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "env2.registry.net",
      ]);
    });

    it("should trim whitespace from environment variable registries", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "  env1.registry.com  ,  env2.registry.net  ";
      configFileContent = undefined;

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "env2.registry.net",
      ]);
    });

    it("should merge environment variable and config file registries", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "env1.registry.com";
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: ["config1.registry.net"],
        },
      });

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "config1.registry.net",
      ]);
    });

    it("should remove duplicate registries when merging env and config", () => {
      delete process.env[envVarName];
      process.env[
        envVarName
      ] = `${packageManager}.company.com,env.registry.com`;
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: [
            `${packageManager}.company.com`,
            "config.registry.net",
          ],
        },
      });

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com`,
        "env.registry.com",
        "config.registry.net",
      ]);
    });

    it("should normalize protocols from environment variable registries", () => {
      delete process.env[envVarName];
      process.env[envVarName] =
        "https://env1.registry.com,http://env2.registry.net";
      configFileContent = undefined;

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "env2.registry.net",
      ]);
    });

    it("should handle empty strings in comma-separated list", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "env1.registry.com,,env2.registry.net,";
      configFileContent = undefined;

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "env2.registry.net",
      ]);
    });

    it("should handle single registry in environment variable", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "single.registry.com";
      configFileContent = undefined;

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, ["single.registry.com"]);
    });

    it("should return empty array for empty environment variable", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "";
      configFileContent = undefined;

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, []);
    });

    it("should return empty array for whitespace-only environment variable", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "   ,  ,  ";
      configFileContent = undefined;

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, []);
    });
  });
}

describe("getLoggingLevel", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.SAFE_CHAIN_LOGGING;
    delete process.env.SAFE_CHAIN_LOGGING;
    // Reset CLI arguments state
    initializeCliArguments([]);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SAFE_CHAIN_LOGGING = originalEnv;
    } else {
      delete process.env.SAFE_CHAIN_LOGGING;
    }
  });

  it("should return normal by default when nothing is configured", () => {
    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_NORMAL);
  });

  it("should return silent from environment variable", () => {
    process.env.SAFE_CHAIN_LOGGING = "silent";

    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_SILENT);
  });

  it("should return verbose from environment variable", () => {
    process.env.SAFE_CHAIN_LOGGING = "verbose";

    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_VERBOSE);
  });

  it("should handle uppercase environment variable values", () => {
    process.env.SAFE_CHAIN_LOGGING = "VERBOSE";

    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_VERBOSE);
  });

  it("should handle mixed case environment variable values", () => {
    process.env.SAFE_CHAIN_LOGGING = "Silent";

    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_SILENT);
  });

  it("should return normal for invalid environment variable values", () => {
    process.env.SAFE_CHAIN_LOGGING = "invalid";

    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_NORMAL);
  });

  it("should prioritize CLI argument over environment variable", () => {
    process.env.SAFE_CHAIN_LOGGING = "verbose";
    initializeCliArguments(["--safe-chain-logging=silent"]);

    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_SILENT);
  });

  it("should use environment variable when CLI argument is not set", () => {
    process.env.SAFE_CHAIN_LOGGING = "silent";
    initializeCliArguments(["install", "express"]);

    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_SILENT);
  });

  it("should return normal when CLI argument is invalid (even if env var is valid)", () => {
    process.env.SAFE_CHAIN_LOGGING = "verbose";
    initializeCliArguments(["--safe-chain-logging=invalid"]);

    const level = getLoggingLevel();

    assert.strictEqual(level, LOGGING_NORMAL);
  });
});

describe("getNpmMinimumPackageAgeExclusions", () => {
  let originalEnv;
  const envVarName = "SAFE_CHAIN_NPM_MINIMUM_PACKAGE_AGE_EXCLUSIONS";

  beforeEach(() => {
    originalEnv = process.env[envVarName];
    delete process.env[envVarName];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[envVarName] = originalEnv;
    } else {
      delete process.env[envVarName];
    }
    configFileContent = undefined;
  });

  it("should return empty array when no exclusions configured", () => {
    configFileContent = undefined;

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, []);
  });

  it("should return exclusions from config file", () => {
    configFileContent = JSON.stringify({
      npm: {
        minimumPackageAgeExclusions: ["react", "@aikidosec/safe-chain"],
      },
    });

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, ["react", "@aikidosec/safe-chain"]);
  });

  it("should parse comma-separated exclusions from environment variable", () => {
    process.env[envVarName] = "lodash,express,@types/node";
    configFileContent = undefined;

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, ["lodash", "express", "@types/node"]);
  });

  it("should merge environment variable and config file exclusions", () => {
    process.env[envVarName] = "lodash";
    configFileContent = JSON.stringify({
      npm: {
        minimumPackageAgeExclusions: ["react"],
      },
    });

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, ["lodash", "react"]);
  });

  it("should remove duplicate exclusions when merging", () => {
    process.env[envVarName] = "lodash,react";
    configFileContent = JSON.stringify({
      npm: {
        minimumPackageAgeExclusions: ["react", "express"],
      },
    });

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, ["lodash", "react", "express"]);
  });

  it("should trim whitespace from environment variable exclusions", () => {
    process.env[envVarName] = "  lodash  ,  react  ";
    configFileContent = undefined;

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, ["lodash", "react"]);
  });

  it("should handle scoped packages", () => {
    configFileContent = JSON.stringify({
      npm: {
        minimumPackageAgeExclusions: ["@babel/core", "@types/react"],
      },
    });

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, ["@babel/core", "@types/react"]);
  });

  it("should handle empty strings in comma-separated list", () => {
    process.env[envVarName] = "lodash,,react,";
    configFileContent = undefined;

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, ["lodash", "react"]);
  });

  it("should return empty array for empty environment variable", () => {
    process.env[envVarName] = "";
    configFileContent = undefined;

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, []);
  });

  it("should return empty array for whitespace-only environment variable", () => {
    process.env[envVarName] = "   ,  ,  ";
    configFileContent = undefined;

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, []);
  });

  it("should filter non-string values from config file", () => {
    configFileContent = JSON.stringify({
      npm: {
        minimumPackageAgeExclusions: ["react", 123, null, "lodash", undefined],
      },
    });

    const exclusions = getNpmMinimumPackageAgeExclusions();

    assert.deepStrictEqual(exclusions, ["react", "lodash"]);
  });
});
