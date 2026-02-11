import chalk from "chalk";
import { ui } from "../environment/userInteraction.js";
import { detectShells } from "./shellDetection.js";
import {
  knownAikidoTools,
  getPackageManagerList,
  getScriptsDir,
} from "./helpers.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** @type {string} */
// This checks the current file's dirname in a way that's compatible with:
//  - Modulejs (import.meta.url)
//  - ES modules (__dirname)
// This is needed because safe-chain's npm package is built using ES modules,
// but building the binaries requires commonjs.
let dirname;
if (import.meta.url) {
  const filename = fileURLToPath(import.meta.url);
  dirname = path.dirname(filename);
} else {
  dirname = __dirname;
}

/**
 * Loops over the detected shells and calls the setup function for each.
 */
export async function setup() {
  ui.writeInformation(
    chalk.bold("Setting up shell aliases.") +
      ` This will wrap safe-chain around ${getPackageManagerList()}.`,
  );
  ui.emptyLine();

  copyStartupFiles();

  try {
    const shells = detectShells();
    if (shells.length === 0) {
      ui.writeError("No supported shells detected. Cannot set up aliases.");
      return;
    }

    ui.writeInformation(
      `Detected ${shells.length} supported shell(s): ${shells
        .map((shell) => chalk.bold(shell.name))
        .join(", ")}.`,
    );

    let updatedCount = 0;
    for (const shell of shells) {
      if (await setupShell(shell)) {
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      ui.emptyLine();
      ui.writeInformation(`Please restart your terminal to apply the changes.`);
    }
  } catch (/** @type {any} */ error) {
    ui.writeError(
      `Failed to set up shell aliases: ${error.message}. Please check your shell configuration.`,
    );
    return;
  }
}

/**
 * Calls the setup function for the given shell and reports the result.
 * @param {import("./shellDetection.js").Shell} shell
 */
async function setupShell(shell) {
  let success = false;
  let error;
  try {
    shell.teardown(knownAikidoTools); // First, tear down to prevent duplicate aliases
    success = await shell.setup(knownAikidoTools);
  } catch (/** @type {any} */ err) {
    success = false;
    error = err;
  }

  if (success) {
    ui.writeInformation(
      `${chalk.bold("- " + shell.name + ":")} ${chalk.green(
        "Setup successful",
      )}`,
    );
  } else {
    ui.writeError(
      `${chalk.bold("- " + shell.name + ":")} ${chalk.red(
        "Setup failed",
      )}. Please check your ${shell.name} configuration.`,
    );
    if (error) {
      let message = `  Error: ${error.message}`;
      if (error.code) {
        message += ` (code: ${error.code})`;
      }
      ui.writeError(message);
    }
  }

  return success;
}

function copyStartupFiles() {
  const startupFiles = ["init-posix.sh", "init-pwsh.ps1", "init-fish.fish"];
  const targetDir = getScriptsDir();

  for (const file of startupFiles) {
    const targetPath = path.join(targetDir, file);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Use absolute path for source
    const sourcePath = path.join(dirname, "startup-scripts", file);
    fs.copyFileSync(sourcePath, targetPath);
  }
}
