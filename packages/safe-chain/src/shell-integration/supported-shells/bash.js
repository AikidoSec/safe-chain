import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
} from "../helpers.js";
import { execSync, spawnSync } from "child_process";
import * as os from "os";

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

  // Removes the line that sources the safe-chain bash initialization script (~/.aikido/scripts/init-posix.sh)
  removeLinesMatchingPattern(
    startupFile,
    /^source\s+~\/\.safe-chain\/scripts\/init-posix\.sh/,
    eol
  );

  return true;
}

function setup() {
  const startupFile = getStartupFile();

  addLineToFile(
    startupFile,
    `source ~/.safe-chain/scripts/init-posix.sh # Safe-chain bash initialization script`,
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

/**
 * @type {import("../shellDetection.js").Shell}
 */
export default {
  name: shellName,
  isInstalled,
  setup,
  teardown,
};
