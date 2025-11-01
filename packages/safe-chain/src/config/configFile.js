import fs from "fs";
import path from "path";
import os from "os";
import { ui } from "../environment/userInteraction.js";

/**
 * @returns {number}
 */
export function getScanTimeout() {
  if (process.env.AIKIDO_SCAN_TIMEOUT_MS) {
    const timeout = parseInt(process.env.AIKIDO_SCAN_TIMEOUT_MS);
    if (!isNaN(timeout) && timeout >= 0) {
      return timeout;
    }
  }

  const config = readConfigFile();

  if (hasScanTimeout(config) && config.scanTimeout >= 0) {
    return config.scanTimeout;
  }

  return 10000; // Default to 10 seconds
}

/**
 * @param {unknown} config
 *
 * @returns {config is {scanTimeout: number}}
 */
function hasScanTimeout(config) {
  return (
    typeof config === "object" &&
    config !== null &&
    "scanTimeout" in config &&
    typeof config.scanTimeout === "number"
  );
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
 * @returns {unknown}
 */
function readConfigFile() {
  const configFilePath = getConfigFilePath();

  if (!fs.existsSync(configFilePath)) {
    return {};
  }

  const data = fs.readFileSync(configFilePath, "utf8");
  return JSON.parse(data);
}

/**
 * @returns {string}
 */
function getDatabasePath() {
  const aikidoDir = getAikidoDirectory();
  return path.join(aikidoDir, "malwareDatabase.json");
}

function getDatabaseVersionPath() {
  const aikidoDir = getAikidoDirectory();
  return path.join(aikidoDir, "version.txt");
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
