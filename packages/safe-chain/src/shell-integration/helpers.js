import { spawnSync } from "child_process";
import * as os from "os";
import fs from "fs";
import path from "path";
import { ECOSYSTEM_JS, ECOSYSTEM_PY } from "../config/settings.js";
import { safeSpawn } from "../utils/safeSpawn.js";
import { ui } from "../environment/userInteraction.js";

/**
 * @typedef {Object} AikidoTool
 * @property {string} tool
 * @property {string} aikidoCommand
 * @property {string} ecoSystem
 * @property {string} internalPackageManagerName
 */

/**
 * @type {AikidoTool[]}
 */
export const knownAikidoTools = [
  {
    tool: "npm",
    aikidoCommand: "aikido-npm",
    ecoSystem: ECOSYSTEM_JS,
    internalPackageManagerName: "npm",
  },
  {
    tool: "npx",
    aikidoCommand: "aikido-npx",
    ecoSystem: ECOSYSTEM_JS,
    internalPackageManagerName: "npx",
  },
  {
    tool: "yarn",
    aikidoCommand: "aikido-yarn",
    ecoSystem: ECOSYSTEM_JS,
    internalPackageManagerName: "yarn",
  },
  {
    tool: "pnpm",
    aikidoCommand: "aikido-pnpm",
    ecoSystem: ECOSYSTEM_JS,
    internalPackageManagerName: "pnpm",
  },
  {
    tool: "pnpx",
    aikidoCommand: "aikido-pnpx",
    ecoSystem: ECOSYSTEM_JS,
    internalPackageManagerName: "pnpx",
  },
  {
    tool: "bun",
    aikidoCommand: "aikido-bun",
    ecoSystem: ECOSYSTEM_JS,
    internalPackageManagerName: "bun",
  },
  {
    tool: "bunx",
    aikidoCommand: "aikido-bunx",
    ecoSystem: ECOSYSTEM_JS,
    internalPackageManagerName: "bunx",
  },
  {
    tool: "uv",
    aikidoCommand: "aikido-uv",
    ecoSystem: ECOSYSTEM_PY,
    internalPackageManagerName: "uv",
  },
  {
    tool: "pip",
    aikidoCommand: "aikido-pip",
    ecoSystem: ECOSYSTEM_PY,
    internalPackageManagerName: "pip",
  },
  {
    tool: "pip3",
    aikidoCommand: "aikido-pip3",
    ecoSystem: ECOSYSTEM_PY,
    internalPackageManagerName: "pip",
  },
  {
    tool: "poetry",
    aikidoCommand: "aikido-poetry",
    ecoSystem: ECOSYSTEM_PY,
    internalPackageManagerName: "poetry",
  },
  {
    tool: "python",
    aikidoCommand: "aikido-python",
    ecoSystem: ECOSYSTEM_PY,
    internalPackageManagerName: "pip",
  },
  {
    tool: "python3",
    aikidoCommand: "aikido-python3",
    ecoSystem: ECOSYSTEM_PY,
    internalPackageManagerName: "pip",
  },
  {
    tool: "pipx",
    aikidoCommand: "aikido-pipx",
    ecoSystem: ECOSYSTEM_PY,
    internalPackageManagerName: "pipx",
  },
  // When adding a new tool here, also update the documentation for the new tool in the README.md
];

/**
 * Returns a formatted string listing all supported package managers.
 * Example: "npm, npx, yarn, pnpm, and pnpx commands"
 */
export function getPackageManagerList() {
  const tools = knownAikidoTools.map((t) => t.tool);
  if (tools.length <= 1) {
    return `${tools[0] || ""} commands`;
  }
  if (tools.length === 2) {
    return `${tools[0]} and ${tools[1]} commands`;
  }
  const lastTool = tools.pop();
  return `${tools.join(", ")}, and ${lastTool} commands`;
}

/**
 * @returns {string}
 */
export function getShimsDir() {
  return path.join(os.homedir(), ".safe-chain", "shims");
}

/**
 * @returns {string}
 */
export function getScriptsDir() {
  return path.join(os.homedir(), ".safe-chain", "scripts");
}

/**
 * @param {string} executableName
 *
 * @returns {boolean}
 */
export function doesExecutableExistOnSystem(executableName) {
  if (os.platform() === "win32") {
    const result = spawnSync("where", [executableName], { stdio: "ignore" });
    return result.status === 0;
  } else {
    const result = spawnSync("which", [executableName], { stdio: "ignore" });
    return result.status === 0;
  }
}

/**
 * @param {string} filePath
 * @param {RegExp} pattern
 * @param {string} [eol]
 *
 * @returns {void}
 */
export function removeLinesMatchingPattern(filePath, pattern, eol) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  eol = eol || os.EOL;

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split(/\r?\n|\r|\u2028|\u2029/);
  const updatedLines = lines.filter((line) => !shouldRemoveLine(line, pattern));
  fs.writeFileSync(filePath, updatedLines.join(eol), "utf-8");
}

const maxLineLength = 100;

/**
 * @param {string} line
 * @param {RegExp} pattern
 * @returns {boolean}
 */
function shouldRemoveLine(line, pattern) {
  const isPatternMatch = pattern.test(line);

  if (!isPatternMatch) {
    return false;
  }

  if (line.length > maxLineLength) {
    // safe-chain only adds lines shorter than maxLineLength
    // so if the line is longer, it must be from a different
    // source and could be dangerous to remove
    return false;
  }

  if (
    line.includes("\n") ||
    line.includes("\r") ||
    line.includes("\u2028") ||
    line.includes("\u2029")
  ) {
    // If the line contains newlines, something has gone wrong in splitting
    // \u2028 and \u2029 are Unicode line separator characters (line and paragraph separators)
    return false;
  }

  return true;
}

/**
 * @param {string} filePath
 * @param {string} line
 * @param {string} [eol]
 *
 * @returns {void}
 */
export function addLineToFile(filePath, line, eol) {
  createFileIfNotExists(filePath);

  eol = eol || os.EOL;

  const fileContent = fs.readFileSync(filePath, "utf-8");
  let updatedContent = fileContent;

  if (!fileContent.endsWith(eol)) {
    updatedContent += eol;
  }

  updatedContent += line + eol;
  fs.writeFileSync(filePath, updatedContent, "utf-8");
}

/**
 * @param {string} filePath
 *
 * @returns {void}
 */
function createFileIfNotExists(filePath) {
  if (fs.existsSync(filePath)) {
    return;
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, "", "utf-8");
}

/**
 * Checks if PowerShell execution policy allows script execution
 * @param {string} shellExecutableName - The name of the PowerShell executable ("pwsh" or "powershell")
 * @returns {Promise<{isValid: boolean, policy: string}>} validation result
 */
export async function validatePowerShellExecutionPolicy(shellExecutableName) {
  // Security: Only allow known shell executables
  const validShells = ["pwsh", "powershell"];
  if (!validShells.includes(shellExecutableName)) {
    return { isValid: false, policy: "Unknown" };
  }

  try {
    // For Windows PowerShell (5.1), clean PSModulePath to avoid conflicts with PowerShell 7 modules
    // When safe-chain is invoked from PowerShell 7, it sets its module paths to PSModulePath, causing
    // Windows PowerShell to try loading incompatible PowerShell 7 modules.
    // Setting the environment to Windows PowerShell's modules fixes this.
    let spawnOptions;
    if (shellExecutableName === "powershell") {
      const userProfile = process.env.USERPROFILE || "";
      const cleanPSModulePath = [
        path.join(userProfile, "Documents", "WindowsPowerShell", "Modules"),
        "C:\\Program Files\\WindowsPowerShell\\Modules",
        "C:\\WINDOWS\\system32\\WindowsPowerShell\\v1.0\\Modules",
      ].join(";");

      spawnOptions = {
        env: {
          ...process.env,
          PSModulePath: cleanPSModulePath,
        },
      };
    } else {
      spawnOptions = {};
    }

    const commandResult = await safeSpawn(
      shellExecutableName,
      ["-Command", "Get-ExecutionPolicy"],
      spawnOptions,
    );

    const policy = commandResult.stdout.trim();

    const acceptablePolicies = ["RemoteSigned", "Unrestricted", "Bypass"];
    return {
      isValid: acceptablePolicies.includes(policy),
      policy: policy,
    };
  } catch (err) {
    ui.writeWarning(
      `An error happened while trying to find the current executionpolicy in powershell: ${err}`,
    );
    return { isValid: false, policy: "Unknown" };
  }
}
