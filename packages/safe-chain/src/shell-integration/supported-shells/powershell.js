import {
  addLineToFile,
  doesExecutableExistOnSystem,
  removeLinesMatchingPattern,
  validatePowerShellExecutionPolicy,
  getScriptsDir,
} from "../helpers.js";
import { execSync } from "child_process";
import path from "path";

const shellName = "PowerShell Core";
const executableName = "pwsh";
const startupFileCommand = "echo $PROFILE";

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
      new RegExp(`^Set-Alias\\s+${tool}\\s+`),
    );
  }

  // Remove sourcing line to prevent shell from loading safe-chain after uninstallation
  removeLinesMatchingPattern(
    startupFile,
    /^\.\s+["']?.*init-pwsh\.ps1["']?.*#\s*Safe-chain/,
  );

  return true;
}

async function setup() {
  const { isValid, policy } =
    await validatePowerShellExecutionPolicy(executableName);
  if (!isValid) {
    throw new Error(
      `PowerShell execution policy is set to '${policy}', which prevents safe-chain from running.\n  -> To fix this, open PowerShell as Administrator and run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned.\n     For more information, see: https://help.aikido.dev/code-scanning/aikido-malware-scanning/safe-chain-troubleshooting#powershell-execution-policy-blocks-scripts-windows`,
    );
  }

  const startupFile = getStartupFile();

  addLineToFile(
    startupFile,
    `. "${path.join(getScriptsDir(), "init-pwsh.ps1")}" # Safe-chain PowerShell initialization script`,
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
      `Command failed: ${startupFileCommand}. Error: ${error.message}`,
    );
  }
}

function getManualTeardownInstructions() {
  return [
    `Remove the following line from your PowerShell profile (run "echo $PROFILE" to find its location):`,
    `  . "${path.join(getScriptsDir(), "init-pwsh.ps1")}"`,
    `Then restart your terminal or run: . $PROFILE`,
  ];
}

function getManualSetupInstructions() {
  return [
    `Add the following line to your PowerShell profile (run "echo $PROFILE" to find its location):`,
    `  . "${path.join(getScriptsDir(), "init-pwsh.ps1")}"`,
    `Then restart your terminal or run: . $PROFILE`,
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
