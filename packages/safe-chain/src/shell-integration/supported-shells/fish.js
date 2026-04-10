import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
  getScriptsDir,
  getSafeChainDir,
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

  // Removes the line that sources the safe-chain fish initialization script (any path, requires safe-chain comment)
  removeLinesMatchingPattern(
    startupFile,
    /^source\s+.*init-fish\.fish.*#\s*Safe-chain/,
    eol
  );

  removeLinesMatchingPattern(
    startupFile,
    /^set\s+-gx\s+SAFE_CHAIN_DIR\s+.*#\s*Safe-chain/,
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
      `set -gx SAFE_CHAIN_DIR "${customDir}" # Safe-chain installation directory`,
      eol
    );
  }

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

/** @param {string} preamble */
function buildManualInstructions(preamble) {
  const customDir = getSafeChainDir();
  const instructions = [preamble];

  if (customDir) {
    instructions.push(
      `  set -gx SAFE_CHAIN_DIR "${customDir}"`,
      `  source ${path.join(getScriptsDir(), "init-fish.fish")}`,
    );
  } else {
    instructions.push(`  source ~/.safe-chain/scripts/init-fish.fish`);
  }

  instructions.push(
    `Then restart your terminal or run: source ~/.config/fish/config.fish`,
  );
  return instructions;
}

function getManualTeardownInstructions() {
  return buildManualInstructions(`Remove the following line from your ~/.config/fish/config.fish file:`);
}

function getManualSetupInstructions() {
  return buildManualInstructions(`Add the following line to your ~/.config/fish/config.fish file:`);
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
