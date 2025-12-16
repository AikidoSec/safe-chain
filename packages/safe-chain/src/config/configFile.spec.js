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

    configFileContent = undefined;
  });

  it("should return default timeout of 10000ms when no config or env var is set", () => {
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
    configFileContent = undefined;

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 10000);
  });

  it("should return timeout from config file when set", () => {
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
    configFileContent = JSON.stringify({ scanTimeout: 5000 });

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 5000);
  });

  it("should prioritize environment variable over config file", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "20000";
    configFileContent = JSON.stringify({ scanTimeout: 5000 });

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 20000);
  });

  it("should handle invalid environment variable and fall back to config", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "invalid";
    configFileContent = JSON.stringify({ scanTimeout: 7000 });

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 7000);
  });

  it("should ignore zero and negative values and fall back to default", () => {
    configFileContent = undefined;

    process.env.AIKIDO_SCAN_TIMEOUT_MS = "0";

    let timeout = getScanTimeout();
    assert.strictEqual(timeout, 10000);

    process.env.AIKIDO_SCAN_TIMEOUT_MS = "-5000";

    timeout = getScanTimeout();
    assert.strictEqual(timeout, 10000);
  });

  it("should ignore textual non-numeric values in environment variable and fall back to config", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "fast";
    configFileContent = JSON.stringify({ scanTimeout: 8000 });

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 8000);
  });

  it("should ignore textual non-numeric values in config file and fall back to default", () => {
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
    configFileContent = JSON.stringify({ scanTimeout: "slow" });

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 10000);
  });

  it("should ignore textual non-numeric values in both env and config, fall back to default", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "quick";
    configFileContent = JSON.stringify({ scanTimeout: "medium" });

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 10000);
  });

  it("should ignore mixed alphanumeric strings in environment variable", () => {
    process.env.AIKIDO_SCAN_TIMEOUT_MS = "5000ms";
    configFileContent = JSON.stringify({ scanTimeout: 6000 });

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 6000);
  });

  it("should ignore mixed alphanumeric strings in config file", () => {
    delete process.env.AIKIDO_SCAN_TIMEOUT_MS;
    configFileContent = JSON.stringify({ scanTimeout: "3000ms" });

    const timeout = getScanTimeout();

    assert.strictEqual(timeout, 10000);
  });
});

describe("getMinimumPackageAgeHours", async () => {
  const { getMinimumPackageAgeHours } = await import("./configFile.js");

  afterEach(() => {
    configFileContent = undefined;
  });

  it("should return null when config file doesn't exist", () => {
    configFileContent = undefined;

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should return null when config file exists but minimumPackageAgeHours is not set", () => {
    configFileContent = JSON.stringify({ scanTimeout: 5000 });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should return value from config file when set to valid number", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: 48 });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 48);
  });

  it("should handle string numbers in config file", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: "72" });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 72);
  });

  it("should handle decimal values", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: 1.5 });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 1.5);
  });

  it("should return null for non-numeric strings", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: "invalid" });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should return undefined for values with units suffix", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: "48h" });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should handle malformed JSON and return null", () => {
    configFileContent = "{ invalid json";

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, undefined);
  });

  it("should return 0 when minimumPackageAgeHours is set to 0", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: 0 });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 0);
  });

  it("should return 0 when minimumPackageAgeHours is set to string '0'", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: "0" });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, 0);
  });

  it("should handle negative numeric values", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: -24 });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, -24);
  });

  it("should handle negative string values", () => {
    configFileContent = JSON.stringify({ minimumPackageAgeHours: "-48" });

    const hours = getMinimumPackageAgeHours();

    assert.strictEqual(hours, -48);
  });
});
