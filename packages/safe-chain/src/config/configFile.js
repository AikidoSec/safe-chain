import fs from "fs";
import path from "path";
import os from "os";
import { ui } from "../environment/userInteraction.js";
import { getEcoSystem } from "./settings.js";

/**
 * @typedef {Object} SafeChainConfig
 *
 * We cannot trust the input and should add the necessary validations
 * @property {unknown | Number} scanTimeout
 * @property {unknown | Number} minimumPackageAgeHours
 * @property {unknown | SafeChainRegistryConfiguration} npm
 *
 * @typedef {Object} SafeChainRegistryConfiguration
 * We cannot trust the input and should add the necessary validations.
 * @property {unknown | string[]} customRegistries
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
    npm: {
      customRegistries: undefined,
    },
  };

  const configFilePath = getConfigFilePath();

  if (!fs.existsSync(configFilePath)) {
    return emptyConfig;
  }

  try {
    const data = fs.readFileSync(configFilePath, "utf8");
    return JSON.parse(data);
  } catch {
    return emptyConfig;
  }
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
function getConfigFilePath() {
  return path.join(getAikidoDirectory(), "config.json");
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
