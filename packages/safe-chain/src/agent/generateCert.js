import { generateCACertificate } from "../registryProxy/certUtils.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";

/**
 * Generate certificate command
 * Allows us to call this independently, for instance from the installer.
 * @param {string[]} args - Command line arguments
 */
export async function generateCertCommand(args) {
  // Parse output directory from --output flag
  let outputDir = join(homedir(), ".safe-chain");
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      outputDir = args[i + 1];
      break;
    }
  }
  
  try {
    // Create output directory
    mkdirSync(outputDir, { recursive: true });
    
    // Generate certificate
    const { cert, key } = generateCACertificate();
    
    // Write certificate and key files
    const certPath = join(outputDir, "ca-cert.pem");
    const keyPath = join(outputDir, "ca-key.pem");
    
    writeFileSync(certPath, cert);
    writeFileSync(keyPath, key);
  } catch (/** @type {any} */ error) {
    process.exit(1);
  }
}
