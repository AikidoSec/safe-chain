import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import os from "os";
import path from "path";
import { stringify as stringifyYaml } from "yaml";

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

// Default fake cwd for describes that don't exercise the repo config (.aikido) walk-up.
// Placed one level under the real home directory so the walk-up in findAikidoFilePath hits
// the home-dir stop condition on its very first check, without ever touching the real
// filesystem (fs is fully mocked above) or picking up a real .git/.aikido from the dev
// machine or CI checkout.
let currentCwd = path.join(os.homedir(), "safe-chain-test-default-cwd");
mock.method(process, "cwd", () => currentCwd);

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

describe("getLogFile", async () => {
  const { getLogFile } = await import("./configFile.js");

  afterEach(() => {
    mockFiles.clear();
  });

  it("should return undefined when config file doesn't exist", () => {
    assert.strictEqual(getLogFile(), undefined);
  });

  it("should return undefined when logFile is not set", () => {
    setConfigContent(JSON.stringify({ scanTimeout: 5000 }));

    assert.strictEqual(getLogFile(), undefined);
  });

  it("should return log file path from config", () => {
    setConfigContent(JSON.stringify({ logFile: "/tmp/safe-chain.log" }));

    assert.strictEqual(getLogFile(), "/tmp/safe-chain.log");
  });

  it("should return undefined for non-string logFile values", () => {
    setConfigContent(JSON.stringify({ logFile: 123 }));

    assert.strictEqual(getLogFile(), undefined);
  });

  it("should return undefined for empty string logFile", () => {
    setConfigContent(JSON.stringify({ logFile: "" }));

    assert.strictEqual(getLogFile(), undefined);
  });

  it("should handle malformed JSON and return undefined", () => {
    setConfigContent("{ invalid json");

    assert.strictEqual(getLogFile(), undefined);
  });
});

describe("getLogFileFormat", async () => {
  const { getLogFileFormat } = await import("./configFile.js");

  afterEach(() => {
    mockFiles.clear();
  });

  it("should return undefined when config file doesn't exist", () => {
    assert.strictEqual(getLogFileFormat(), undefined);
  });

  it("should return undefined when logFileFormat is not set", () => {
    setConfigContent(JSON.stringify({ scanTimeout: 5000 }));

    assert.strictEqual(getLogFileFormat(), undefined);
  });

  it("should return log format from config", () => {
    setConfigContent(JSON.stringify({ logFileFormat: "json" }));

    assert.strictEqual(getLogFileFormat(), "json");
  });

  it("should return plain format from config", () => {
    setConfigContent(JSON.stringify({ logFileFormat: "plain" }));

    assert.strictEqual(getLogFileFormat(), "plain");
  });

  it("should return undefined for non-string logFileFormat values", () => {
    setConfigContent(JSON.stringify({ logFileFormat: 42 }));

    assert.strictEqual(getLogFileFormat(), undefined);
  });

  it("should return undefined for empty string logFileFormat", () => {
    setConfigContent(JSON.stringify({ logFileFormat: "" }));

    assert.strictEqual(getLogFileFormat(), undefined);
  });

  it("should handle malformed JSON and return undefined", () => {
    setConfigContent("{ invalid json");

    assert.strictEqual(getLogFileFormat(), undefined);
  });
});

describe("getLogFileVerbosity", async () => {
  const { getLogFileVerbosity } = await import("./configFile.js");

  afterEach(() => {
    mockFiles.clear();
  });

  it("should return undefined when config file doesn't exist", () => {
    assert.strictEqual(getLogFileVerbosity(), undefined);
  });

  it("should return undefined when logFileVerbosity is not set", () => {
    setConfigContent(JSON.stringify({ scanTimeout: 5000 }));

    assert.strictEqual(getLogFileVerbosity(), undefined);
  });

  it("should return verbosity from config", () => {
    setConfigContent(JSON.stringify({ logFileVerbosity: "normal" }));

    assert.strictEqual(getLogFileVerbosity(), "normal");
  });

  it("should return undefined for non-string values", () => {
    setConfigContent(JSON.stringify({ logFileVerbosity: 42 }));

    assert.strictEqual(getLogFileVerbosity(), undefined);
  });

  it("should return undefined for empty string", () => {
    setConfigContent(JSON.stringify({ logFileVerbosity: "" }));

    assert.strictEqual(getLogFileVerbosity(), undefined);
  });
});

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

describe("repo config", async () => {
  const {
    getScanTimeout,
    getMinimumPackageAgeHours,
    getMalwareListBaseUrl,
    getNpmCustomRegistries,
    getMinimumPackageAgeExclusions,
  } = await import("./configFile.js");

  const defaultCwd = currentCwd;

  afterEach(() => {
    mockFiles.clear();
    currentCwd = defaultCwd;
  });

  /**
   * @param {string} dir
   * @returns {string}
   */
  function aikidoPathAt(dir) {
    return path.join(dir, ".aikido");
  }

  /**
   * @param {string} dir
   * @param {any} safeChainSection
   */
  function setAikidoSafeChainSection(dir, safeChainSection) {
    mockFiles.set(
      aikidoPathAt(dir),
      stringifyYaml({ "safe-chain": safeChainSection })
    );
  }

  it("finds a repo config at cwd itself", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setAikidoSafeChainSection(cwd, { minimumPackageAgeHours: 11 });

    assert.strictEqual(getMinimumPackageAgeHours(), 11);
  });

  it("finds a repo config several directories up with no .git in between", () => {
    const repoRoot = path.join(os.homedir(), "repo");
    currentCwd = path.join(repoRoot, "packages", "foo", "src");
    setAikidoSafeChainSection(repoRoot, { minimumPackageAgeHours: 22 });

    assert.strictEqual(getMinimumPackageAgeHours(), 22);
  });

  it("checks a directory containing .git before stopping the walk", () => {
    const repoRoot = path.join(os.homedir(), "repo");
    currentCwd = path.join(repoRoot, "src");
    mockFiles.set(path.join(repoRoot, ".git"), "");
    setAikidoSafeChainSection(repoRoot, { minimumPackageAgeHours: 33 });

    assert.strictEqual(getMinimumPackageAgeHours(), 33);
  });

  it("stops at the repo root (.git) and does not search above it", () => {
    const aboveRepo = path.join(os.homedir(), "workspace");
    const repoRoot = path.join(aboveRepo, "repo");
    currentCwd = path.join(repoRoot, "src");
    mockFiles.set(path.join(repoRoot, ".git"), "");
    // No .aikido at repoRoot itself; one exists further up above the repo boundary -
    // it must not be found.
    setAikidoSafeChainSection(aboveRepo, { minimumPackageAgeHours: 44 });

    assert.strictEqual(getMinimumPackageAgeHours(), undefined);
  });

  it("stops at the home directory and does not search above it", () => {
    currentCwd = path.join(os.homedir(), "repo", "src");
    // "Poison" config placed above the home directory - must never be reached.
    const aboveHome = path.dirname(path.resolve(os.homedir()));
    setAikidoSafeChainSection(aboveHome, { minimumPackageAgeHours: 55 });

    assert.strictEqual(getMinimumPackageAgeHours(), undefined);
  });

  it("falls back to home/default config when no .aikido file exists anywhere", () => {
    currentCwd = path.join(os.homedir(), "repo", "deep", "nested", "dir");

    assert.strictEqual(getMinimumPackageAgeHours(), undefined);
  });

  it("ignores an .aikido file with no safe-chain: section (e.g. written for another Aikido tool)", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: 70 }));
    mockFiles.set(
      aikidoPathAt(cwd),
      stringifyYaml({ exclude: { paths: ["benchmarks/", "docs/"] } })
    );

    assert.strictEqual(getMinimumPackageAgeHours(), 70);
  });

  it("overrides minimumPackageAgeHours from the repo config over the home config", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: 90 }));
    setAikidoSafeChainSection(cwd, { minimumPackageAgeHours: 12 });

    assert.strictEqual(getMinimumPackageAgeHours(), 12);
  });

  it("deep-merges nested npm config: repo overrides one key, home's sibling key is kept", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setConfigContent(
      JSON.stringify({
        npm: {
          customRegistries: ["home.registry.com"],
          minimumPackageAgeExclusions: ["home-pkg"],
        },
      })
    );
    setAikidoSafeChainSection(cwd, {
      npm: { minimumPackageAgeExclusions: ["left-pad"] },
    });

    assert.deepStrictEqual(getNpmCustomRegistries(), ["home.registry.com"]);
    assert.deepStrictEqual(getMinimumPackageAgeExclusions(), ["home-pkg", "left-pad"]);
  });

  it("unions arrays instead of one replacing the other", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setConfigContent(
      JSON.stringify({ npm: { customRegistries: ["a.registry.com", "b.registry.com"] } })
    );
    setAikidoSafeChainSection(cwd, {
      npm: { customRegistries: ["b.registry.com", "c.registry.com"] },
    });

    assert.deepStrictEqual(getNpmCustomRegistries(), [
      "a.registry.com",
      "b.registry.com",
      "c.registry.com",
    ]);
  });

  it("falls back to the home value for keys the repo config omits", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: 70 }));
    setAikidoSafeChainSection(cwd, { npm: { customRegistries: ["x.registry.com"] } });

    assert.strictEqual(getMinimumPackageAgeHours(), 70);
  });

  it("treats a malformed .aikido file as absent, leaving home config unaffected", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setConfigContent(JSON.stringify({ minimumPackageAgeHours: 60 }));
    mockFiles.set(aikidoPathAt(cwd), "safe-chain: [this is not: valid: yaml");

    assert.strictEqual(getMinimumPackageAgeHours(), 60);
  });

  it("does not allow a repo config to override scanTimeout", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setConfigContent(JSON.stringify({ scanTimeout: 9000 }));
    setAikidoSafeChainSection(cwd, { scanTimeout: 1234 });

    assert.strictEqual(getScanTimeout(), 9000);
  });

  it("does not allow a repo config to override malwareListBaseUrl", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setConfigContent(
      JSON.stringify({ malwareListBaseUrl: "https://home.example.com" })
    );
    setAikidoSafeChainSection(cwd, {
      malwareListBaseUrl: "https://malicious.example.com",
    });

    assert.strictEqual(getMalwareListBaseUrl(), "https://home.example.com");
  });

  it("does not allow a repo config to set malwareListBaseUrl when home has none set", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setAikidoSafeChainSection(cwd, {
      malwareListBaseUrl: "https://malicious.example.com",
    });

    assert.strictEqual(getMalwareListBaseUrl(), undefined);
  });

  it("ignores disallowed keys in a repo config while still applying allowed ones", () => {
    const cwd = path.join(os.homedir(), "repo");
    currentCwd = cwd;
    setAikidoSafeChainSection(cwd, {
      scanTimeout: 1,
      malwareListBaseUrl: "https://malicious.example.com",
      minimumPackageAgeHours: 15,
    });

    assert.strictEqual(getScanTimeout(), 10000);
    assert.strictEqual(getMalwareListBaseUrl(), undefined);
    assert.strictEqual(getMinimumPackageAgeHours(), 15);
  });
});
