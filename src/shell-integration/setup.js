import chalk from "chalk";
import { ui } from "../environment/userInteraction.js";
import { detectShells, detectPackageManagerIntegrations } from "./integrationDetection.js";
import { knownAikidoTools } from "./helpers.js";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Loops over the detected shells and calls the setup function for each.
 */
export async function setup() {
  ui.writeInformation(
    chalk.bold("Setting up shell aliases.") +
      " This will wrap safe-chain around npm, npx, and yarn commands."
  );
  ui.emptyLine();

  copyStartupFiles();

  const shellUpdatedCount = setupShells();
  const packageManagerUpdatedCount = setupPackageManagers();

  if (shellUpdatedCount > 0 || packageManagerUpdatedCount > 0) {
    ui.emptyLine();
    ui.writeInformation(`Please restart your terminal to apply the changes.`);
  }
}

/**
 * Sets up all detected shells and returns the count of successful setups.
 */
function setupShells() {
  let shellUpdatedCount = 0;

  try {
    const shells = detectShells();
    if (shells.length === 0) {
      ui.writeError("No supported shells detected. Cannot set up aliases.");
      return 0;
    }

    ui.writeInformation(
      `Detected ${shells.length} supported shell(s): ${shells
        .map((shell) => chalk.bold(shell.name))
        .join(", ")}.`
    );

    for (const shell of shells) {
      if (setupShell(shell)) {
        shellUpdatedCount++;
      }
    }
  } catch (error) {
    ui.writeError(
      `Failed to set up shell aliases: ${error.message}. Please check your shell configuration.`
    );
    return 0;
  }

  return shellUpdatedCount;
}

/**
 * Sets up all detected package managers and returns the count of successful setups.
 */
function setupPackageManagers() {
  let packageManagerUpdatedCount = 0;

  try {
    const packageManagers = detectPackageManagerIntegrations();
    
    if (packageManagers.length > 0) {
      ui.emptyLine();
      ui.writeInformation(
        `Detected ${packageManagers.length} supported package manager(s): ${packageManagers
          .map((pm) => chalk.bold(pm.name))
          .join(", ")}.`
      );

      for (const packageManager of packageManagers) {
        if (setupPackageManager(packageManager)) {
          packageManagerUpdatedCount++;
        }
      }
    }
  } catch (error) {
    ui.writeError(
      `Failed to setup package manager integrations: ${error.message}. Please check your package manager configuration.`
    );
  }

  return packageManagerUpdatedCount;
}

/**
 * Calls the setup function for the given shell and reports the result.
 */
function setupShell(shell) {
  let success = false;
  try {
    shell.teardown(knownAikidoTools); // First, tear down to prevent duplicate aliases
    success = shell.setup(knownAikidoTools);
  } catch {
    success = false;
  }

  if (success) {
    ui.writeInformation(
      `${chalk.bold("- " + shell.name + ":")} ${chalk.green(
        "Setup successful"
      )}`
    );
  } else {
    ui.writeError(
      `${chalk.bold("- " + shell.name + ":")} ${chalk.red(
        "Setup failed"
      )}. Please check your ${shell.name} configuration.`
    );
  }

  return success;
}

function setupPackageManager(packageManager) {
  let success = false;
  try {
    success = packageManager.setup();
  } catch {
    success = false;
  }

  if (success) {
    ui.writeInformation(
      `${chalk.bold("- " + packageManager.name + ":")} ${chalk.green(
        "Setup successful"
      )}`
    );
  } else {
    ui.writeError(
      `${chalk.bold("- " + packageManager.name + ":")} ${chalk.red(
        "Setup failed"
      )}. Please check your ${packageManager.name} configuration.`
    );
  }

  return success;
}

function copyStartupFiles() {
  const startupFiles = ["init-posix.sh", "init-pwsh.ps1", "init-fish.fish"];

  for (const file of startupFiles) {
    const targetDir = path.join(os.homedir(), ".safe-chain", "scripts");
    const targetPath = path.join(os.homedir(), ".safe-chain", "scripts", file);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Use absolute path for source
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const sourcePath = path.resolve(__dirname, "startup-scripts", file);
    fs.copyFileSync(sourcePath, targetPath);
  }
}
