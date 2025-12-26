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

for (const packageManager of ["npm", "pip"]) {
  const fnName = `get${packageManager.charAt(0).toUpperCase()}${packageManager.slice(1)}CustomRegistries`;
  const envVarName = `SAFE_CHAIN_${packageManager.toUpperCase()}_CUSTOM_REGISTRIES`;

  describe(fnName, async () => {
    let originalEnv;
    const fn = (await import("./settings.js"))[fnName];

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

      const registries = fn();

      assert.deepStrictEqual(registries, []);
    });

    it("should return registries without protocol", () => {
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: [`${packageManager}.company.com`, "registry.internal.net"],
        },
      });

      const registries = fn();

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

      const registries = fn();

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

      const registries = fn();

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

      const registries = fn();

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

      const registries = fn();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com/custom/path`,
        `registry.internal.net/${packageManager}`,
      ]);
    });

    it("should parse comma-separated registries from environment variable", () => {
      delete process.env[envVarName];
      process.env[envVarName] =
        "env1.registry.com,env2.registry.net";
      configFileContent = undefined;

      const registries = fn();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "env2.registry.net",
      ]);
    });

    it("should trim whitespace from environment variable registries", () => {
      delete process.env[envVarName];
      process.env[envVarName] =
        "  env1.registry.com  ,  env2.registry.net  ";
      configFileContent = undefined;

      const registries = fn();

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

      const registries = fn();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "config1.registry.net",
      ]);
    });

    it("should remove duplicate registries when merging env and config", () => {
      delete process.env[envVarName];
      process.env[envVarName] =
        `${packageManager}.company.com,env.registry.com`;
      configFileContent = JSON.stringify({
        [packageManager]: {
          customRegistries: [`${packageManager}.company.com`, "config.registry.net"],
        },
      });

      const registries = fn();

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

      const registries = fn();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "env2.registry.net",
      ]);
    });

    it("should handle empty strings in comma-separated list", () => {
      delete process.env[envVarName];
      process.env[envVarName] =
        "env1.registry.com,,env2.registry.net,";
      configFileContent = undefined;

      const registries = fn();

      assert.deepStrictEqual(registries, [
        "env1.registry.com",
        "env2.registry.net",
      ]);
    });

    it("should handle single registry in environment variable", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "single.registry.com";
      configFileContent = undefined;

      const registries = fn();

      assert.deepStrictEqual(registries, ["single.registry.com"]);
    });

    it("should return empty array for empty environment variable", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "";
      configFileContent = undefined;

      const registries = fn();

      assert.deepStrictEqual(registries, []);
    });

    it("should return empty array for whitespace-only environment variable", () => {
      delete process.env[envVarName];
      process.env[envVarName] = "   ,  ,  ";
      configFileContent = undefined;

      const registries = fn();

      assert.deepStrictEqual(registries, []);
    });
  });
}
