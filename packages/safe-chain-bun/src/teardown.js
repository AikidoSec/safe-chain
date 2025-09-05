import fs from "fs";
import path from "path";
import { getGlobalConfigPath, removeScannerFromToml } from "./toml-utils.js";

/**
 * Main teardown function that removes safe-chain-bun as a security scanner
 * @param {string|undefined} configFile - Optional path to specific bunfig.toml file
 */
export function teardown(configFile) {
  try {
    const targetFile = configFile ? path.resolve(configFile) : getGlobalConfigPath();
    const isGlobal = !configFile;
    
    if (!fs.existsSync(targetFile)) {
      const displayPath = isGlobal ? "~/.bunfig.toml" : configFile;
      console.log(`ℹ️  Config file not found: ${displayPath}`);
      return;
    }
    
    const content = fs.readFileSync(targetFile, "utf8");
    const result = removeScannerFromToml(content);
    
    if (result.changed) {
      fs.writeFileSync(targetFile, result.content, "utf8");
      const displayPath = isGlobal ? "~/.bunfig.toml" : configFile;
      console.log(`✅ Safe-Chain-Bun scanner removed from ${displayPath}`);
    } else {
      const displayPath = isGlobal ? "~/.bunfig.toml" : configFile;
      console.log(`ℹ️  Safe-Chain-Bun scanner not found in ${displayPath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to remove Safe-Chain-Bun scanner: ${error.message}`);
    process.exit(1);
  }
}