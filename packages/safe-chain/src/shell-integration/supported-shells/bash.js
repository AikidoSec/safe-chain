import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
  getScriptsDir,
} from "../helpers.js";
import { execSync, spawnSync } from "child_process";
import * as os from "os";
import path from "path";

const shellName = "Bash";
const executableName = "bash";
const startupFileCommand = "echo ~/.bashrc";
const eol = "\n"; // When bash runs on Windows (e.g., Git Bash or WSL), it expects LF line endings.

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

  // Marker comment ensures only safe-chain-added lines are removed, not user's own source statements
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
    `source ${path.join(getScriptsDir(), "init-posix.sh")} # Safe-chain bash initialization script`,
    eol
  );

  return true;
}

function getStartupFile() {
  try {
    var path = execSync(startupFileCommand, {
      encoding: "utf8",
      shell: executableName,
    }).trim();

    return windowsFixPath(path);
  } catch (/** @type {any} */ error) {
    throw new Error(
      `Command failed: ${startupFileCommand}. Error: ${error.message}`
    );
  }
}

/**
 * @param {string} path
 *
 * @returns {string}
 */
function windowsFixPath(path) {
  try {
    if (os.platform() !== "win32") {
      return path;
    }

    // On windows cygwin bash, paths are returned in format /c/user/..., but we need it in format C:\user\...
    // To convert, the cygpath -w command can be used to convert to the desired format.
    // Cygpath only exists on Cygwin, so we first check if the command is available.
    // If it is, we use it to convert the path.
    if (hasCygpath()) {
      return cygpathw(path);
    }

    return path;
  } catch {
    return path;
  }
}

function hasCygpath() {
  try {
    var result = spawnSync("where", ["cygpath"], { shell: executableName });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * @param {string} path
 *
 * @returns {string}
 */
function cygpathw(path) {
  try {
    var result = spawnSync("cygpath", ["-w", path], {
      encoding: "utf8",
      shell: executableName,
    });
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return path;
  } catch {
    return path;
  }
}

/** @param {string} preamble */
function buildManualInstructions(preamble) {
  const instructions = [preamble, `  source ${path.join(getScriptsDir(), "init-posix.sh")}`];
  instructions.push(`Then restart your terminal or run: source ~/.bashrc`);
  return instructions;
}

function getManualTeardownInstructions() {
  return buildManualInstructions(`Remove the following line from your ~/.bashrc file:`);
}

function getManualSetupInstructions() {
  return buildManualInstructions(`Add the following line to your ~/.bashrc file:`);
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
