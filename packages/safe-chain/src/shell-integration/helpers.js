import { spawnSync } from "child_process";
import * as os from "os";
import fs from "fs";
import path from "path";
import { ECOSYSTEM_JS, ECOSYSTEM_PY } from "../config/settings.js";

/**
 * @typedef {Object} AikidoTool
 * @property {string} tool
 * @property {string} aikidoCommand
 * @property {string} ecoSystem
 */

/**
 * @type {AikidoTool[]}
 */
export const knownAikidoTools = [
  { tool: "npm", aikidoCommand: "aikido-npm", ecoSystem: ECOSYSTEM_JS },
  { tool: "npx", aikidoCommand: "aikido-npx", ecoSystem: ECOSYSTEM_JS },
  { tool: "yarn", aikidoCommand: "aikido-yarn", ecoSystem: ECOSYSTEM_JS },
  { tool: "pnpm", aikidoCommand: "aikido-pnpm", ecoSystem: ECOSYSTEM_JS },
  { tool: "pnpx", aikidoCommand: "aikido-pnpx", ecoSystem: ECOSYSTEM_JS },
  { tool: "bun", aikidoCommand: "aikido-bun", ecoSystem: ECOSYSTEM_JS },
  { tool: "bunx", aikidoCommand: "aikido-bunx", ecoSystem: ECOSYSTEM_JS },
  { tool: "uv", aikidoCommand: "aikido-uv", ecoSystem: ECOSYSTEM_PY },
  { tool: "pip", aikidoCommand: "aikido-pip", ecoSystem: ECOSYSTEM_PY },
  { tool: "pip3", aikidoCommand: "aikido-pip3", ecoSystem: ECOSYSTEM_PY },
  { tool: "python", aikidoCommand: "aikido-python", ecoSystem: ECOSYSTEM_PY },
  { tool: "python3", aikidoCommand: "aikido-python3", ecoSystem: ECOSYSTEM_PY },
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
  const updatedContent = fileContent + eol + line + eol;
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
