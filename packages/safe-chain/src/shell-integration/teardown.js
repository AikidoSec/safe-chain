import chalk from "chalk";
import { ui } from "../environment/userInteraction.js";
import { detectShells } from "./shellDetection.js";
import { knownAikidoTools, getPackageManagerList } from "./helpers.js";

/**
 * @returns {Promise<void>}
 */
export async function teardown() {
  ui.writeInformation(
    chalk.bold("Removing shell aliases.") +
      ` This will remove safe-chain aliases for ${getPackageManagerList()}.`
  );
  ui.emptyLine();

  try {
    const shells = detectShells();
    if (shells.length === 0) {
      ui.writeError("No supported shells detected. Cannot remove aliases.");
      return;
    }

    ui.writeInformation(
      `Detected ${shells.length} supported shell(s): ${shells
        .map((shell) => chalk.bold(shell.name))
        .join(", ")}.`
    );

    let updatedCount = 0;
    for (const shell of shells) {
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
        updatedCount++;
      } else {
        ui.writeError(
          `${chalk.bold("- " + shell.name + ":")} ${chalk.red(
            "Teardown failed"
          )}. Please check your ${shell.name} configuration.`
        );
      }
    }

    if (updatedCount > 0) {
      ui.emptyLine();
      ui.writeInformation(`Please restart your terminal to apply the changes.`);
    }
  } catch (/** @type {any} */ error) {
    ui.writeError(
      `Failed to remove shell aliases: ${error.message}. Please check your shell configuration.`
    );
    return;
  }
}
