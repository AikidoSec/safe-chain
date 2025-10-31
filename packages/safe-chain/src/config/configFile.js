import fs from "fs";
import path from "path";
import os from "os";
import { ui } from "../environment/userInteraction.js";
import { getEcoSystem } from "./settings.js";

export function getScanTimeout() {
  const config = readConfigFile();
  return (
    parseInt(process.env.AIKIDO_SCAN_TIMEOUT_MS) || config.scanTimeout || 10000 // Default to 10 seconds
  );
}

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

function readConfigFile() {
  const configFilePath = getConfigFilePath();

  if (!fs.existsSync(configFilePath)) {
    return {};
  }

  const data = fs.readFileSync(configFilePath, "utf8");
  return JSON.parse(data);
}

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

function getConfigFilePath() {
  return path.join(getAikidoDirectory(), "config.json");
}

function getAikidoDirectory() {
  const homeDir = os.homedir();
  const aikidoDir = path.join(homeDir, ".aikido");

  if (!fs.existsSync(aikidoDir)) {
    fs.mkdirSync(aikidoDir, { recursive: true });
  }
  return aikidoDir;
}
