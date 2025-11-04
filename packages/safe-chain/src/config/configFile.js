import fs from "fs";
import path from "path";
import os from "os";
import { ui } from "../environment/userInteraction.js";
import { getEcoSystem } from "./settings.js";

/**
 * @typedef {Object} SafeChainConfig
 *
 * This should be a number, but can be anything because it is user-input.
 * We cannot trust the input and should add the necessary validations.
 * @property {any} scanTimeout
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
  const configFilePath = getConfigFilePath();

  if (!fs.existsSync(configFilePath)) {
    return {
      scanTimeout: undefined,
    };
  }

  try {
    const data = fs.readFileSync(configFilePath, "utf8");
    return JSON.parse(data);
  } catch {
    return {
      scanTimeout: undefined,
    };
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
