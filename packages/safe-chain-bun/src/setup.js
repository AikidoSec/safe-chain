import fs from "fs";
import path from "path";
import os from "os";

/**
 * Main setup function that registers safe-chain-bun as a security scanner
 * @param {string|undefined} configFile - Optional path to specific bunfig.toml file
 */
export function setup(configFile) {
  try {
    const targetFile = configFile ? path.resolve(configFile) : getGlobalConfigPath();
    const isGlobal = !configFile;
    
    if (configFile && !fs.existsSync(targetFile)) {
      console.error(`❌ Config file not found: ${configFile}`);
      process.exit(1);
    }
    
    const updated = updateBunfigFile(targetFile, isGlobal);
    
    if (updated) {
      const displayPath = isGlobal ? "~/.bunfig.toml" : configFile;
      console.log(`✅ Safe-Chain-Bun registered as security scanner in ${displayPath}`);
    } else {
      const displayPath = isGlobal ? "~/.bunfig.toml" : configFile;
      console.log(`ℹ️  Safe-Chain-Bun is already configured as security scanner in ${displayPath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to setup Safe-Chain-Bun: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Gets the global bunfig.toml path
 * @returns {string} Path to global bunfig.toml
 */
function getGlobalConfigPath() {
  return path.join(os.homedir(), ".bunfig.toml");
}

/**
 * Updates or creates a bunfig.toml file with safe-chain-bun scanner configuration
 * @param {string} filePath - Path to the bunfig.toml file
 * @param {boolean} isGlobal - Whether this is the global config file
 * @returns {boolean} True if file was updated, false if already configured
 */
function updateBunfigFile(filePath, isGlobal) {
  let content = "";
  let fileExists = fs.existsSync(filePath);
  
  if (fileExists) {
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      throw new Error(`Failed to read ${filePath}: ${error.message}`);
    }
  } else if (!isGlobal) {
    // For specific files, they must exist
    throw new Error(`Config file does not exist: ${filePath}`);
  }
  
  const result = addScannerToToml(content);
  
  if (!result.changed) {
    return false; // Already configured
  }
  
  try {
    // Ensure directory exists for global config
    if (isGlobal && !fileExists) {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      console.log(`ℹ️  Created ${filePath} with Safe-Chain-Bun configuration`);
    } else if (fileExists) {
      console.log(`ℹ️  Updated existing bunfig.toml with Safe-Chain-Bun scanner`);
    }
    
    fs.writeFileSync(filePath, result.content, "utf8");
    return true;
  } catch (error) {
    if (error.code === "EACCES") {
      throw new Error(`Permission denied writing to ${filePath}`);
    }
    throw new Error(`Failed to write ${filePath}: ${error.message}`);
  }
}

/**
 * Adds or updates the scanner configuration in TOML content
 * @param {string} content - Existing TOML content
 * @returns {{content: string, changed: boolean}} Updated content and change status
 */
export function addScannerToToml(content) {
  const scannerLine = 'scanner = "@aikidosec/safe-chain-bun"';
  
  if (content.includes(scannerLine)) {
    return { content, changed: false };
  }
  
  const lines = content.split(/[\r\n\u2028\u2029]+/);
  const installSecurityRegex = /^\[install\.security\]$/;
  const scannerRegex = /^scanner\s*=.*$/;
  
  const securitySectionIndex = lines.findIndex(line => installSecurityRegex.test(line));
  
  if (securitySectionIndex >= 0) {
    const scannerLineIndex = lines.findIndex((line, index) => 
      index > securitySectionIndex && scannerRegex.test(line)
    );
    
    if (scannerLineIndex >= 0) {
      lines[scannerLineIndex] = scannerLine;
    } else {
      lines.splice(securitySectionIndex + 1, 0, scannerLine);
    }
  } else {
    if (lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push('[install.security]');
    lines.push(scannerLine);
    lines.push('');
  }
  
  return { content: lines.join(os.EOL), changed: true };
}