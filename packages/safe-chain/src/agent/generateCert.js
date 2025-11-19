/**
 * Generate certificate command for Safe Chain
 * Creates CA certificate and key for MITM proxy
 */

import { generateCACertificate } from "../registryProxy/certUtils.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";

/**
 * Generate certificate command
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
    ui.writeInformation(chalk.bold("Generating Safe Chain CA certificate..."));
    ui.emptyLine();
    
    // Create output directory
    mkdirSync(outputDir, { recursive: true });
    
    // Generate certificate
    const { cert, key } = generateCACertificate();
    
    // Write certificate and key files
    const certPath = join(outputDir, "ca-cert.pem");
    const keyPath = join(outputDir, "ca-key.pem");
    
    writeFileSync(certPath, cert);
    writeFileSync(keyPath, key);
    
    ui.writeInformation(chalk.green("✓") + " Certificate generated successfully!");
    ui.emptyLine();
    ui.writeInformation(chalk.bold("Files created:"));
    ui.writeInformation(`  Certificate: ${chalk.cyan(certPath)}`);
    ui.writeInformation(`  Private Key: ${chalk.cyan(keyPath)}`);
    ui.emptyLine();
    ui.writeInformation(chalk.dim("To install this certificate in your system trust store:"));
    ui.writeInformation(chalk.dim("  macOS:   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain " + certPath));
    ui.writeInformation(chalk.dim("  Linux:   sudo cp " + certPath + " /usr/local/share/ca-certificates/ && sudo update-ca-certificates"));
    ui.writeInformation(chalk.dim("  Windows: certutil -addstore -f ROOT " + certPath));
    ui.emptyLine();
  } catch (/** @type {any} */ error) {
    ui.writeError(`Failed to generate certificate: ${error.message}`);
    process.exit(1);
  }
}
