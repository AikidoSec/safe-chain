import fs from "fs";
import path from "path";
import os from "os";
import { parse as parseYaml } from "yaml";
import { ui } from "../environment/userInteraction.js";
import { getEcoSystem } from "./settings.js";
import { getSafeChainBaseDir } from "./safeChainDir.js";

/**
 * @typedef {Object} SafeChainConfig
 *
 * We cannot trust the input and should add the necessary validations
 * @property {unknown | Number} scanTimeout
 * @property {unknown | Number} minimumPackageAgeHours
 * @property {unknown | string} malwareListBaseUrl
 * @property {unknown | string} logFile
 * @property {unknown | string} logFileFormat
 * @property {unknown | string} logFileVerbosity
 * @property {unknown | SafeChainRegistryConfiguration} npm
 * @property {unknown | SafeChainRegistryConfiguration} pip
 *
 * @typedef {Object} SafeChainRegistryConfiguration
 * We cannot trust the input and should add the necessary validations.
 * @property {unknown | string[]} customRegistries
 * @property {unknown | string[]} minimumPackageAgeExclusions
 */

/**
 * @returns {number}
 */
export function getScanTimeout() {
  const config = readConfigFile();

  if (process.env.AIKIDO_SCAN_TIMEOUT_MS) {
    const scanTimeout = validateTimeout(process.env.AIKIDO_SCAN_TIMEOUT_MS);
    if (scanTimeout != null) {
      return scanTimeout;
    }
  }

  if (config.scanTimeout) {
    const scanTimeout = validateTimeout(config.scanTimeout);
    if (scanTimeout != null) {
      return scanTimeout;
    }
  }

  return 10000; // Default to 10 seconds
}

/**
 *
 * @param {any} value
 * @returns {number?}
 */
function validateTimeout(value) {
  const timeout = Number(value);
  if (!Number.isNaN(timeout) && timeout > 0) {
    return timeout;
  }
  return null;
}

/**
 * @param {any} value
 * @returns {number | undefined}
 */
function validateMinimumPackageAgeHours(value) {
  const hours = Number(value);
  if (!Number.isNaN(hours)) {
    return hours;
  }
  return undefined;
}

/**
 * Gets the minimum package age in hours from config file only
 * @returns {number | undefined}
 */
export function getMinimumPackageAgeHours() {
  const config = readConfigFile();
  if (config.minimumPackageAgeHours !== undefined) {
    const validated = validateMinimumPackageAgeHours(
      config.minimumPackageAgeHours
    );
    if (validated !== undefined) {
      return validated;
    }
  }
  return undefined;
}

/**
 * Gets the malware list base URL from config file only
 * @returns {string | undefined}
 */
export function getMalwareListBaseUrl() {
  const config = readConfigFile();
  if (config.malwareListBaseUrl && typeof config.malwareListBaseUrl === "string") {
    return config.malwareListBaseUrl;
  }
  return undefined;
}

/**
 * Gets the log file path from the config file
 * @returns {string | undefined}
 */
export function getLogFile() {
  const config = readConfigFile();
  if (config.logFile && typeof config.logFile === "string") {
    return config.logFile;
  }
  return undefined;
}

/**
 * Gets the log file format from the config file
 * @returns {string | undefined}
 */
export function getLogFileFormat() {
  const config = readConfigFile();
  if (config.logFileFormat && typeof config.logFileFormat === "string") {
    return config.logFileFormat;
  }
  return undefined;
}

/**
 * Gets the log file verbosity from the config file
 * @returns {string | undefined}
 */
export function getLogFileVerbosity() {
  const config = readConfigFile();
  if (config.logFileVerbosity && typeof config.logFileVerbosity === "string") {
    return config.logFileVerbosity;
  }
  return undefined;
}

/**
 * Gets the custom npm registries from the config file (format parsing only, no validation)
 * @returns {string[]}
 */
export function getNpmCustomRegistries() {
  const config = readConfigFile();

  if (!config || !config.npm) {
    return [];
  }

  // TypeScript needs help understanding that config.npm exists and has customRegistries
  const npmConfig = /** @type {SafeChainRegistryConfiguration} */ (config.npm);
  const customRegistries = npmConfig.customRegistries;

  if (!Array.isArray(customRegistries)) {
    return [];
  }

  return customRegistries.filter((item) => typeof item === "string");
}

/**
 * Gets the custom npm registries from the config file (format parsing only, no validation)
 * @returns {string[]}
 */
export function getPipCustomRegistries() {
  const config = readConfigFile();

  if (!config || !config.pip) {
    return [];
  }

  // TypeScript needs help understanding that config.pip exists and has customRegistries
  const pipConfig = /** @type {SafeChainRegistryConfiguration} */ (config.pip);
  const customRegistries = pipConfig.customRegistries;

  if (!Array.isArray(customRegistries)) {
    return [];
  }

  return customRegistries.filter((item) => typeof item === "string");
}

/**
 * Gets the minimum package age exclusions from the config file for the current ecosystem
 * @returns {string[]}
 */
export function getMinimumPackageAgeExclusions() {
  const config = readConfigFile();
  const ecosystem = getEcoSystem();
  const registryConfig = ecosystem === "py" ? config.pip : config.npm;

  if (!config || !registryConfig) {
    return [];
  }

  const typedRegistryConfig =
    /** @type {SafeChainRegistryConfiguration} */ (registryConfig);
  const exclusions = typedRegistryConfig.minimumPackageAgeExclusions;

  if (!Array.isArray(exclusions)) {
    return [];
  }

  return exclusions.filter((item) => typeof item === "string");
}

/**
 * @param {import("../api/aikido.js").MalwarePackage[]} data
 * @param {string | number} version
 *
 * @returns {void}
 */
export function writeDatabaseToLocalCache(data, version) {
  try {
    const databasePath = getDatabasePath();
    const versionPath = getDatabaseVersionPath();

    fs.writeFileSync(databasePath, JSON.stringify(data));
    fs.writeFileSync(versionPath, version.toString());
  } catch {
    ui.writeWarning(
      "Failed to write malware database to local cache, next time the database will be fetched from the server again."
    );
  }
}

/**
 * @returns {{malwareDatabase: import("../api/aikido.js").MalwarePackage[] | null, version: string | null}}
 */
export function readDatabaseFromLocalCache() {
  try {
    const databasePath = getDatabasePath();
    if (!fs.existsSync(databasePath)) {
      return {
        malwareDatabase: null,
        version: null,
      };
    }
    const data = fs.readFileSync(databasePath, "utf8");
    const malwareDatabase = JSON.parse(data);
    const versionPath = getDatabaseVersionPath();
    let version = null;
    if (fs.existsSync(versionPath)) {
      version = fs.readFileSync(versionPath, "utf8").trim();
    }
    return {
      malwareDatabase: malwareDatabase,
      version: version,
    };
  } catch {
    ui.writeWarning(
      "Failed to read malware database from local cache. Continuing without local cache."
    );
    return {
      malwareDatabase: null,
      version: null,
    };
  }
}

/**
 * @returns {SafeChainConfig}
 */
function readConfigFile() {
  /** @type {SafeChainConfig} */
  const emptyConfig = {
    scanTimeout: undefined,
    minimumPackageAgeHours: undefined,
    malwareListBaseUrl: undefined,
    logFile: undefined,
    logFileFormat: undefined,
    logFileVerbosity: undefined,
    npm: {
      customRegistries: undefined,
    },
    pip: {
      customRegistries: undefined,
    },
  };

  const homeConfig = readConfigContentAt(getConfigFilePath(), emptyConfig);

  const aikidoFilePath = findAikidoFilePath();
  if (!aikidoFilePath) {
    return homeConfig;
  }

  const aikidoDocument = readYamlFileAt(aikidoFilePath);
  if (!isPlainObject(aikidoDocument)) {
    return homeConfig;
  }

  return deepMergeConfig(
    homeConfig,
    pickAllowedRepoConfigFields(aikidoDocument["safe-chain"])
  );
}

/**
 * Only these settings may be set by the repo's `.aikido` file, under its `safe-chain:`
 * section. Everything else (malwareListBaseUrl, logFile*, scanTimeout, etc.) must come
 * from the home-tier config - a repo config could otherwise be used to point safe-chain
 * at a malicious malware database, or modify local logging files. Any other top-level
 * keys in `.aikido` (e.g. `exclude:`, used by other Aikido tools) are ignored entirely.
 * @param {any} safeChainSection
 * @returns {Partial<SafeChainConfig>}
 */
function pickAllowedRepoConfigFields(safeChainSection) {
  if (!isPlainObject(safeChainSection)) {
    return {};
  }

  /** @type {Partial<SafeChainConfig>} */
  const allowed = {};

  if (safeChainSection.minimumPackageAgeHours !== undefined) {
    allowed.minimumPackageAgeHours = safeChainSection.minimumPackageAgeHours;
  }

  const npmFields = pickRegistryConfigFields(safeChainSection.npm);
  if (npmFields) {
    allowed.npm = npmFields;
  }

  const pipFields = pickRegistryConfigFields(safeChainSection.pip);
  if (pipFields) {
    allowed.pip = pipFields;
  }

  return allowed;
}

/**
 * @param {any} registryConfig
 * @returns {SafeChainRegistryConfiguration | undefined}
 */
function pickRegistryConfigFields(registryConfig) {
  if (!isPlainObject(registryConfig)) {
    return undefined;
  }

  /** @type {SafeChainRegistryConfiguration} */
  const picked = {};

  if (registryConfig.customRegistries !== undefined) {
    picked.customRegistries = registryConfig.customRegistries;
  }
  if (registryConfig.minimumPackageAgeExclusions !== undefined) {
    picked.minimumPackageAgeExclusions = registryConfig.minimumPackageAgeExclusions;
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
}

/**
 * Reads and JSON-parses the file at `filePath`, returning `fallback` if the file doesn't
 * exist or fails to parse.
 * @template T
 * @param {string} filePath
 * @param {T} fallback
 * @returns {SafeChainConfig | T}
 */
function readConfigContentAt(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

/**
 * Reads and YAML-parses the file at `filePath`, returning `null` if the file doesn't
 * exist or fails to parse.
 * @param {string} filePath
 * @returns {any | null}
 */
function readYamlFileAt(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(filePath, "utf8");
    return parseYaml(data);
  } catch {
    return null;
  }
}

/**
 * Deep-merges `override` on top of `base`. Nested plain objects are merged key-by-key
 * recursively. Arrays (e.g. customRegistries, minimumPackageAgeExclusions) are unioned
 * (deduplicated) rather than one replacing the other, since these are additive
 * allow/exclude lists - a project config should be able to add to the home config's
 * list without silently dropping entries the project didn't repeat. Scalar values in
 * `override` replace the corresponding `base` value.
 * @param {any} base
 * @param {any} override
 * @returns {any}
 */
function deepMergeConfig(base, override) {
  if (Array.isArray(base) && Array.isArray(override)) {
    return Array.from(new Set([...base, ...override]));
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const merged = { ...base };
    for (const key of Object.keys(override)) {
      merged[key] = deepMergeConfig(base[key], override[key]);
    }
    return merged;
  }

  return override !== undefined ? override : base;
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @returns {string}
 */
function getDatabasePath() {
  const aikidoDir = getAikidoDirectory();
  const ecosystem = getEcoSystem();
  return path.join(aikidoDir, `malwareDatabase_${ecosystem}.json`);
}

function getDatabaseVersionPath() {
  const aikidoDir = getAikidoDirectory();
  const ecosystem = getEcoSystem();
  return path.join(aikidoDir, `version_${ecosystem}.txt`);
}

/**
 * @returns {string}
 */
export function getNewPackagesListPath() {
  const safeChainDir = getSafeChainDirectory();
  const ecosystem = getEcoSystem();
  return path.join(safeChainDir, `newPackagesList_${ecosystem}.json`);
}

/**
 * @returns {string}
 */
export function getNewPackagesListVersionPath() {
  const safeChainDir = getSafeChainDirectory();
  const ecosystem = getEcoSystem();
  return path.join(safeChainDir, `newPackagesList_version_${ecosystem}.txt`);
}

/**
 * @returns {string}
 */
function getConfigFilePath() {
  const primaryPath = path.join(getSafeChainDirectory(), "config.json");
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }

  const legacyPath = path.join(getAikidoDirectory(), "config.json");
  if (fs.existsSync(legacyPath)) {
    return legacyPath;
  }

  return primaryPath;
}

/**
 * Walks up from process.cwd() looking for a repo-root `.aikido` file. 
 * Stops (without finding anything further) at whichever boundary is hit first:
 *  - the current directory equals os.homedir()
 *  - a `.git` entry (file or directory) exists in the current directory (repo root) —
 *    that directory's own `.aikido` is still checked before stopping
 *  - the filesystem root is reached (path.dirname(dir) === dir)
 * @returns {string | undefined}
 */
function findAikidoFilePath() {
  const homeDir = path.resolve(os.homedir());
  let dir = path.resolve(process.cwd());

  while (true) {
    if (dir === homeDir) {
      return undefined;
    }

    const candidatePath = path.join(dir, ".aikido");
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }

    if (fs.existsSync(path.join(dir, ".git"))) {
      return undefined;
    }

    const parentDir = path.dirname(dir);
    if (parentDir === dir) {
      return undefined;
    }

    dir = parentDir;
  }
}

/**
 * @returns {string}
 */
export function getSafeChainDirectory() {
  const safeChainDir = getSafeChainBaseDir();

  if (!fs.existsSync(safeChainDir)) {
    fs.mkdirSync(safeChainDir, { recursive: true });
  }
  return safeChainDir;
}

/**
 * @returns {string}
 */
function getAikidoDirectory() {
  const homeDir = os.homedir();
  const aikidoDir = path.join(homeDir, ".aikido");

  if (!fs.existsSync(aikidoDir)) {
    fs.mkdirSync(aikidoDir, { recursive: true });
  }
  return aikidoDir;
}
