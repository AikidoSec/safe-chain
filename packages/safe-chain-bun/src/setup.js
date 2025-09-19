import fs from "fs";
import path from "path";
import { getGlobalConfigPath, addScannerToToml } from "./toml-utils.js";

/**
 * Creates an empty bunfig.toml file if it doesn't exist
 * @param {string} filePath - Path to the bunfig.toml file
 */
function ensureBunfigExists(filePath) {
  if (!fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, "", "utf8");
  }
}

/**
 * Main setup function that registers safe-chain-bun as a security scanner
 * @param {string|undefined} configFile - Optional path to specific bunfig.toml file
 */
export function setup(configFile) {
  try {
    let targetFile = configFile;
    if (!targetFile) {
      targetFile = getGlobalConfigPath();
      ensureBunfigExists(targetFile);
    } else {
      targetFile = path.resolve(configFile);
    }

    if (configFile && !fs.existsSync(targetFile)) {
      console.error(`❌ Config file not found: ${configFile}`);
      process.exit(1);
    }

    const updated = updateBunfigFile(targetFile);

    if (updated) {
      console.log(
        `✅ Safe-Chain-Bun registered as security scanner in ${configFile}`
      );
    } else {
      console.log(
        `ℹ️  Safe-Chain-Bun is already configured as security scanner in ${configFile}`
      );
    }
  } catch (error) {
    console.error(`❌ Failed to setup Safe-Chain-Bun: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Updates a bunfig.toml file with safe-chain-bun scanner configuration
 * @param {string} filePath - Path to the bunfig.toml file
 * @returns {boolean} True if file was updated, false if already configured
 */
function updateBunfigFile(filePath) {
  let content = "";
  let fileExists = fs.existsSync(filePath);

  if (!fileExists) {
    throw new Error(`Config file does not exist: ${filePath}`);
  }

  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }

  const result = addScannerToToml(content);

  if (!result.changed) {
    return false; // Already configured
  }

  try {
    fs.writeFileSync(filePath, result.content, "utf8");
    return true;
  } catch (error) {
    if (error.code === "EACCES") {
      throw new Error(`Permission denied writing to ${filePath}`);
    }
    throw new Error(`Failed to write ${filePath}: ${error.message} (${error.code})`);
  }
}
