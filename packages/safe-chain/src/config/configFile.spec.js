import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import os from "os";
import path from "path";

const safeChainConfigPath = path.join(os.homedir(), ".safe-chain", "config.json");
const aikidoConfigPath = path.join(os.homedir(), ".aikido", "config.json");

/** @type {Map<string, string>} */
let mockFiles = new Map();
mock.module("fs", {
  namedExports: {
    existsSync: (filePath) => mockFiles.has(filePath),
    readFileSync: (filePath) => {
      if (!mockFiles.has(filePath)) {
        throw new Error(`ENOENT: no such file: ${filePath}`);
      }
      return mockFiles.get(filePath);
    },
    writeFileSync: (filePath, content) => mockFiles.set(filePath, content),
    mkdirSync: () => {},
  },
});

/**
 * Helper to set config content at the primary (~/.safe-chain/) location.
 * @param {string} content
 */
function setConfigContent(content) {
  mockFiles.set(safeChainConfigPath, content);
}

describe("getScanTimeout", async () => {
  let originalEnv;

  const { getScanTimeout } = await import("./configFile.js");

  beforeEach(async () => {
    // Save original environment
    originalEnv = process.env.AIKIDO_SCAN_TIMEOUT_MS;
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.AIKIDO_SCAN_TIMEOUT_MS = originalEnv;
    } else {
      delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
    }

    mockFiles.clear();
  });

  it("should return default timeout of 10000ms when no config or env var is set", () => {
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 10000);
  });

  it("should return timeout from config file when set", () => {
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
    setConfigContent(JSON.stringify({ scanTimeout: 5000 }));

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 5000);
  });

  it("should prioritize environment variable over config file", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "20000";
    setConfigContent(JSON.stringify({ scanTimeout: 5000 }));

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 20000);
  });

  it("should handle invalid environment variable and fall back to config", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "invalid";
    setConfigContent(JSON.stringify({ scanTimeout: 7000 }));

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 7000);
  });

  it("should ignore zero and negative values and fall back to default", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "0";

    let timeout = getScanTimeout();
    assert.strictEqual(timeout, 10000);

    process.env.AIKIDO_SCAN_TIMEOUT_MS = "-5000";

    timeout = getScanTimeout();
    assert.strictEqual(timeout, 10000);
  });

  it("should ignore textual non-numeric values in environment variable and fall back to config", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "fast";
    setConfigContent(JSON.stringify({ scanTimeout: 8000 }));

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 8000);
  });

  it("should ignore textual non-numeric values in config file and fall back to default", () => {
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
    setConfigContent(JSON.stringify({ scanTimeout: "slow" }));

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 10000);
  });

  it("should ignore textual non-numeric values in both env and config, fall back to default", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "quick";
    setConfigContent(JSON.stringify({ scanTimeout: "medium" }));

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 10000);
  });

  it("should ignore mixed alphanumeric strings in environment variable", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "5000ms";
    setConfigContent(JSON.stringify({ scanTimeout: 6000 }));

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 6000);
  });

  it("should ignore mixed alphanumeric strings in config file", () => {
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
    setConfigContent(JSON.stringify({ scanTimeout: "3000ms" }));

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 10000);
  });
});

describe("getMinimumPackageAgeHours", async () => {
  const { getMinimumPackageAgeHours } = await import("./configFile.js");

  afterEach(() => {
    mockFiles.clear();
  });

  it("should return null when config file doesn't exist", () => {
    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should return null when config file exists but minimumPackageAgeHours is not set", () => {
    setConfigContent(JSON.stringify({ scanTimeout: 5000 }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should return value from config file when set to valid number", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: 48 }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 48);
  });

  it("should handle string numbers in config file", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: "72" }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 72);
  });

  it("should handle decimal values", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: 1.5 }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 1.5);
  });

  it("should return null for non-numeric strings", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: "invalid" }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should return undefined for values with units suffix", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: "48h" }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should handle malformed JSON and return null", () => {
    setConfigContent("{ invalid json");

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should return 0 when minimumPackageAgeHours is set to 0", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: 0 }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 0);
  });

  it("should return 0 when minimumPackageAgeHours is set to string '0'", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: "0" }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 0);
  });

  it("should handle negative numeric values", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: -24 }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, -24);
  });

  it("should handle negative string values", () => {
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: "-48" }));

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, -48);
  });
});

const { getNpmCustomRegistries, getPipCustomRegistries } = await import(
  "./configFile.js"
);

for (const { packageManager, getCustomRegistries } of [
  {
    packageManager: "npm",
    getCustomRegistries: getNpmCustomRegistries,
  },
  {
    packageManager: "pip",
    getCustomRegistries: getPipCustomRegistries,
  },
])
{
  describe(getCustomRegistries.name, async () => {
    afterEach(() => {
      mockFiles.clear();
    });

    it("should return empty array when config file doesn't exist", () => {
      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, []);
    });

    it(`should return empty array when ${packageManager} config is not set`, () => {
      setConfigContent(JSON.stringify({ scanTimeout: 5000 }));

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, []);
    });

    it("should return empty array when customRegistries is not an array", () => {
      setConfigContent(JSON.stringify({
        [packageManager]: { customRegistries: "not-an-array" },
      }));

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, []);
    });

    it("should return array of custom registries when set", () => {
      setConfigContent(JSON.stringify({
        [packageManager]: {
          customRegistries: [`${packageManager}.company.com`, "registry.internal.net"],
        },
      }));

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com`,
        "registry.internal.net",
      ]);
    });

    it("should filter out non-string values", () => {
      setConfigContent(JSON.stringify({
        [packageManager]: {
          customRegistries: [
            `${packageManager}.company.com`,
            123,
            null,
            "registry.internal.net",
            undefined,
            {},
          ],
        },
      }));

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, [
        `${packageManager}.company.com`,
        "registry.internal.net",
      ]);
    });

    it("should return empty array for empty customRegistries array", () => {
      setConfigContent(JSON.stringify({
        [packageManager]: { customRegistries: [] },
      }));

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, []);
    });

    it("should handle malformed JSON and return empty array", () => {
      setConfigContent("{ invalid json");

      const registries = getCustomRegistries();

      assert.deepStrictEqual(registries, []);
    });
  });
}

describe("config file location fallback", async () => {
  const { getScanTimeout } = await import("./configFile.js");

  afterEach(() => {
    mockFiles.clear();
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
  });

  it("should read config from ~/.safe-chain/config.json when it exists", () => {
    mockFiles.set(safeChainConfigPath, JSON.stringify({ scanTimeout: 3000 }));

    assert.strictEqual(getScanTimeout(), 3000);
  });

  it("should fall back to ~/.aikido/config.json when primary does not exist", () => {
    mockFiles.set(aikidoConfigPath, JSON.stringify({ scanTimeout: 4000 }));

    assert.strictEqual(getScanTimeout(), 4000);
  });

  it("should prefer ~/.safe-chain/config.json when both exist", () => {
    mockFiles.set(safeChainConfigPath, JSON.stringify({ scanTimeout: 3000 }));
    mockFiles.set(aikidoConfigPath, JSON.stringify({ scanTimeout: 4000 }));

    assert.strictEqual(getScanTimeout(), 3000);
  });

  it("should return default when neither config file exists", () => {
    assert.strictEqual(getScanTimeout(), 10000);
  });
});
