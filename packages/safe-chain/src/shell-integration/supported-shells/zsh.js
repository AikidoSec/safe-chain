import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
  getScriptsDir,
  getSafeChainDir,
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

  // Removes the line that sources the safe-chain zsh initialization script (any path, requires safe-chain comment)
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

  const customDir = getSafeChainDir();
  if (customDir) {
    addLineToFile(
      startupFile,
      `export SAFE_CHAIN_DIR="${customDir}" # Safe-chain installation directory`,
      eol
    );
  }

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

function getManualTeardownInstructions() {
  const customDir = getSafeChainDir();
  const instructions = [`Remove the following line from your ~/.zshrc file:`];

  if (customDir) {
    instructions.push(
      `  export SAFE_CHAIN_DIR="${customDir}"`,
      `  source ${path.join(getScriptsDir(), "init-posix.sh")}`,
    );
  } else {
    instructions.push(`  source ~/.safe-chain/scripts/init-posix.sh`);
  }

  instructions.push(`Then restart your terminal or run: source ~/.zshrc`);
  return instructions;
}

function getManualSetupInstructions() {
  const customDir = getSafeChainDir();
  const instructions = [`Add the following line to your ~/.zshrc file:`];

  if (customDir) {
    instructions.push(
      `  export SAFE_CHAIN_DIR="${customDir}"`,
      `  source ${path.join(getScriptsDir(), "init-posix.sh")}`,
    );
  } else {
    instructions.push(`  source ~/.safe-chain/scripts/init-posix.sh`);
  }

  instructions.push(`Then restart your terminal or run: source ~/.zshrc`);
  return instructions;
}

export default {
  name: shellName,
  isInstalled,
  setup,
  teardown,
  getManualSetupInstructions,
  getManualTeardownInstructions,
};
