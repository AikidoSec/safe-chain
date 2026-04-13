import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
  getScriptsDir,
} from "../helpers.js";
import { execSync } from "child_process";
import path from "path";

const shellName = "Zsh";
const executableName = "zsh";
const startupFileCommand = "echo ${ZDOTDIR:-$HOME}/.zshrc";
const eol = "\n"; // When zsh runs on Windows (e.g., Git Bash or WSL), it expects LF line endings.

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
      new RegExp(`^alias\\s+${tool}=`),
      eol
    );
  }

  // Remove init script source line to uninstall shell integration; marker ensures only safe-chain-added lines are removed
  removeLinesMatchingPattern(
    startupFile,
    /^source\s+.*init-posix\.sh.*#\s*Safe-chain/,
    eol
  );

  removeLinesMatchingPattern(
    startupFile,
    /^export\s+SAFE_CHAIN_DIR=.*#\s*Safe-chain/,
    eol
  );

  return true;
}

function setup() {
  const startupFile = getStartupFile();

  addLineToFile(
    startupFile,
    `source ${path.join(getScriptsDir(), "init-posix.sh")} # Safe-chain Zsh initialization script`,
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

/** @param {string} preamble */
function buildManualInstructions(preamble) {
  const instructions = [preamble, `  source ${path.join(getScriptsDir(), "init-posix.sh")}`];
  instructions.push(`Then restart your terminal or run: source ~/.zshrc`);
  return instructions;
}

function getManualTeardownInstructions() {
  return buildManualInstructions(`Remove the following line from your ~/.zshrc file:`);
}

function getManualSetupInstructions() {
  return buildManualInstructions(`Add the following line to your ~/.zshrc file:`);
}

export default {
  name: shellName,
  isInstalled,
  setup,
  teardown,
  getManualSetupInstructions,
  getManualTeardownInstructions,
};
