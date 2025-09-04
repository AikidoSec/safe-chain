import chalk from "chalk";
import { ui } from "../environment/userInteraction.js";
import { detectShells, detectPackageManagerIntegrations } from "./integrationDetection.js";
import { knownAikidoTools } from "./helpers.js";

export async function teardown() {
  ui.writeInformation(
    chalk.bold("Removing shell aliases.") +
      " This will remove safe-chain aliases for npm, npx, and yarn commands."
  );
  ui.emptyLine();

  const shellUpdatedCount = teardownShells();
  const packageManagerUpdatedCount = teardownPackageManagers();

  if (shellUpdatedCount > 0 || packageManagerUpdatedCount > 0) {
    ui.emptyLine();
    ui.writeInformation(`Please restart your terminal to apply the changes.`);
  }
}

/**
 * Tears down all detected shells and returns the count of successful teardowns.
 */
function teardownShells() {
  let shellUpdatedCount = 0;

  try {
    const shells = detectShells();
    if (shells.length === 0) {
      ui.writeError("No supported shells detected. Cannot remove aliases.");
      return 0;
    }

    ui.writeInformation(
      `Detected ${shells.length} supported shell(s): ${shells
        .map((shell) => chalk.bold(shell.name))
        .join(", ")}.`
    );

    for (const shell of shells) {
      if (teardownShell(shell)) {
        shellUpdatedCount++;
      }
    }
  } catch (error) {
    ui.writeError(
      `Failed to remove shell aliases: ${error.message}. Please check your shell configuration.`
    );
    return 0;
  }

  return shellUpdatedCount;
}

/**
 * Tears down all detected package managers and returns the count of successful teardowns.
 */
function teardownPackageManagers() {
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
        if (teardownPackageManager(packageManager)) {
          packageManagerUpdatedCount++;
        }
      }
    }
  } catch (error) {
    ui.writeError(
      `Failed to teardown package manager integrations: ${error.message}. Please check your package manager configuration.`
    );
  }

  return packageManagerUpdatedCount;
}

/**
 * Calls the teardown function for the given shell and reports the result.
 */
function teardownShell(shell) {
  let success = false;
  try {
    success = shell.teardown(knownAikidoTools);
  } catch {
    success = false;
  }

  if (success) {
    ui.writeInformation(
      `${chalk.bold("- " + shell.name + ":")} ${chalk.green(
        "Teardown successful"
      )}`
    );
  } else {
    ui.writeError(
      `${chalk.bold("- " + shell.name + ":")} ${chalk.red(
        "Teardown failed"
      )}. Please check your ${shell.name} configuration.`
    );
  }

  return success;
}

/**
 * Calls the teardown function for the given package manager and reports the result.
 */
function teardownPackageManager(packageManager) {
  let success = false;
  try {
    success = packageManager.teardown();
  } catch {
    success = false;
  }

  if (success) {
    ui.writeInformation(
      `${chalk.bold("- " + packageManager.name + ":")} ${chalk.green(
        "Teardown successful"
      )}`
    );
  } else {
    ui.writeError(
      `${chalk.bold("- " + packageManager.name + ":")} ${chalk.red(
        "Teardown failed"
      )}. Please check your ${packageManager.name} configuration.`
    );
  }

  return success;
}
