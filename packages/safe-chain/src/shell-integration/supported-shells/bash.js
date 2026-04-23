import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
} from "../helpers.js";
import { getScriptsDir } from "../../config/safeChainDir.js";
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

  // Remove sourcing line to disable safe-chain shell integration
  removeLinesMatchingPattern(
    startupFile,
    /^source\s+.*init-posix\.sh.*#\s*Safe-chain/,
    eol
  );

  return true;
}

function setup() {
  const startupFile = getStartupFile();
  const scriptsDir = getShellScriptsDir();

  addLineToFile(
    startupFile,
    `source ${path.posix.join(scriptsDir, "init-posix.sh")} # Safe-chain bash initialization script`,
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

function getShellScriptsDir() {
  return toBashPath(getScriptsDir());
}

/**
 * @param {string} path
 *
 * @returns {string}
 */
function toBashPath(path) {
  try {
    if (os.platform() !== "win32") {
      return path.replace(/\\/g, "/");
    }

    const directWindowsPath = windowsPathToBashPath(path);
    if (directWindowsPath) {
      return directWindowsPath;
    }

    if (hasCygpath()) {
      return convertCygwinPathToUnix(path);
    }

    return path.replace(/\\/g, "/");
  } catch {
    return path.replace(/\\/g, "/");
  }
}

/**
 * @param {string} path
 *
 * @returns {string | undefined}
 */
function windowsPathToBashPath(path) {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(path);
  if (!match) {
    return undefined;
  }

  const [, driveLetter, rest] = match;
  return `/${driveLetter.toLowerCase()}/${rest.replace(/\\/g, "/")}`;
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
 * @param {string} path
 *
 * @returns {string}
 */
function convertCygwinPathToUnix(path) {
  try {
    var result = spawnSync("cygpath", ["-u", path], {
      encoding: "utf8",
      shell: executableName,
    });
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return path.replace(/\\/g, "/");
  } catch {
    return path.replace(/\\/g, "/");
  }
}

function getManualTeardownInstructions() {
  const scriptsDir = getShellScriptsDir();
  return [
    `Remove the following line from your ~/.bashrc file:`,
    `  source ${path.posix.join(scriptsDir, "init-posix.sh")}`,
    `Then restart your terminal or run: source ~/.bashrc`,
  ];
}

function getManualSetupInstructions() {
  const scriptsDir = getShellScriptsDir();
  return [
    `Add the following line to your ~/.bashrc file:`,
    `  source ${path.posix.join(scriptsDir, "init-posix.sh")}`,
    `Then restart your terminal or run: source ~/.bashrc`,
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
