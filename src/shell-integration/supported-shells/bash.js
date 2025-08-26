import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
} from "../helpers.js";
import { execSync } from "child_process";
import { platform } from "os";

const shellName = "Bash";
const executableName = "bash";
const startupFileCommand = "echo ~/.bashrc";

function isInstalled() {
  // Do not try to modify the bash config on Windows as it will fail in most cases.
  // If WSL is installed, the bash command will open the WSL environment.
  // In this case the returned path /home/user/.bashrc is not accessible from Windows.
  // If Git Bash or MinGW is installed, the bash command may open the Git Bash or MinGW environment.
  // It will return a path like /c/Users/user/.bashrc which is not a valid Windows file path.
  if (platform() === "win32") {
    return false;
  }

  return doesExecutableExistOnSystem(executableName);
}

function teardown(tools) {
  const startupFile = getStartupFile();

  for (const { tool } of tools) {
    // Remove any existing alias for the tool
    removeLinesMatchingPattern(startupFile, new RegExp(`^alias\\s+${tool}=`));
  }

  // Removes the line that sources the safe-chain bash initialization script (~/.aikido/scripts/init-posix.sh)
  removeLinesMatchingPattern(
    startupFile,
    /^source\s+~\/\.safe-chain\/scripts\/init-posix\.sh/
  );

  return true;
}

function setup() {
  const startupFile = getStartupFile();

  addLineToFile(
    startupFile,
    `source ~/.safe-chain/scripts/init-posix.sh # Safe-chain bash initialization script`
  );

  return true;
}

function getStartupFile() {
  try {
    return execSync(startupFileCommand, {
      encoding: "utf8",
      shell: executableName,
    }).trim();
  } catch (error) {
    throw new Error(
      `Command failed: ${startupFileCommand}. Error: ${error.message}`
    );
  }
}

export default {
  name: shellName,
  isInstalled,
  setup,
  teardown,
};
