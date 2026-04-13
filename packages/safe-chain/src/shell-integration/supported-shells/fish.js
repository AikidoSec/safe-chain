import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
  getScriptsDir,
} from "../helpers.js";
import { execSync } from "child_process";
import path from "path";

const shellName = "Fish";
const executableName = "fish";
const startupFileCommand = "echo ~/.config/fish/config.fish";
const eol = "\n"; // When fish runs on Windows (e.g., Git Bash or WSL), it expects LF line endings.

function isInstalled() {
  return doesExecutableExistOnSystem(executableName);
}

/**
 * @param {import("../helpers.js").AikidoTool[]} tools
 *
 * @returns {boolean}
 */
function teardown(tools) {
  const startupFile = getStartupFile();

  for (const { tool } of tools) {
    // Remove any existing alias for the tool
    removeLinesMatchingPattern(
      startupFile,
      new RegExp(`^alias\\s+${tool}\\s+`),
      eol
    );
  }

  // Remove sourcing line to prevent safe-chain initialization in future shell sessions
  removeLinesMatchingPattern(
    startupFile,
    /^source\s+.*init-fish\.fish.*#\s*Safe-chain/,
    eol
  );

  return true;
}

function setup() {
  const startupFile = getStartupFile();

  addLineToFile(
    startupFile,
    `source ${path.join(getScriptsDir(), "init-fish.fish")} # Safe-chain Fish initialization script`,
    eol
  );

  return true;
}

function getStartupFile() {
  try {
    return execSync(startupFileCommand, {
      encoding: "utf8",
      shell: executableName,
    }).trim();
  } catch (/** @type {any} */ error) {
    throw new Error(
      `Command failed: ${startupFileCommand}. Error: ${error.message}`
    );
  }
}

function getManualTeardownInstructions() {
  return [
    `Remove the following line from your ~/.config/fish/config.fish file:`,
    `  source ${path.join(getScriptsDir(), "init-fish.fish")}`,
    `Then restart your terminal or run: source ~/.config/fish/config.fish`,
  ];
}

function getManualSetupInstructions() {
  return [
    `Add the following line to your ~/.config/fish/config.fish file:`,
    `  source ${path.join(getScriptsDir(), "init-fish.fish")}`,
    `Then restart your terminal or run: source ~/.config/fish/config.fish`,
  ];
}

/**
 * @type {import("../shellDetection.js").Shell}
 */
export default {
  name: shellName,
  isInstalled,
  setup,
  teardown,
  getManualSetupInstructions,
  getManualTeardownInstructions,
};
