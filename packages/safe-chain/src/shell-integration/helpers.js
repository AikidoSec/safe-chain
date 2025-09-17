import { spawnSync } from "child_process";
import * as os from "os";
import fs from "fs";
import path from "path";

export const knownAikidoTools = [
  { tool: "npm", aikidoCommand: "aikido-npm" },
  { tool: "npx", aikidoCommand: "aikido-npx" },
  { tool: "yarn", aikidoCommand: "aikido-yarn" },
  { tool: "pnpm", aikidoCommand: "aikido-pnpm" },
  { tool: "pnpx", aikidoCommand: "aikido-pnpx" },
  // When adding a new tool here, also update the expected alias in the tests (setup.spec.js, teardown.spec.js)
  // and add the documentation for the new tool in the README.md
];

export function doesExecutableExistOnSystem(executableName) {
  if (os.platform() === "win32") {
    const result = spawnSync("where", [executableName], { stdio: "ignore" });
    return result.status === 0;
  } else {
    const result = spawnSync("which", [executableName], { stdio: "ignore" });
    return result.status === 0;
  }
}

export function removeLinesMatchingPattern(filePath, pattern) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split(/[\r\n\u2028\u2029]+/);
  const updatedLines = lines.filter((line) => !shouldRemoveLine(line, pattern));
  fs.writeFileSync(filePath, updatedLines.join(os.EOL), "utf-8");
}

const maxLineLength = 100;
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

export function addLineToFile(filePath, line) {
  createFileIfNotExists(filePath);

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const updatedContent = fileContent + os.EOL + line + os.EOL;
  fs.writeFileSync(filePath, updatedContent, "utf-8");
}

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
