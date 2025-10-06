import { execSync } from "child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { ui } from "../../environment/userInteraction.js";

const AIKIDO_DIR = join(homedir(), ".aikido");
const LOCKFILE_PATH = join(AIKIDO_DIR, "pnpm-lock.yaml");

export function generatePnpmLockfile(args) {
  try {
    // Ensure .aikido directory exists
    mkdirSync(AIKIDO_DIR, { recursive: true });

    // Run pnpm install --lockfile-only to generate lockfile
    const pnpmCommand = `pnpm ${args.join(" ")} --lockfile-only`;
    execSync(pnpmCommand, { 
      stdio: "pipe",
      cwd: process.cwd()
    });

    // Read the generated lockfile
    const lockfileContent = execSync("cat pnpm-lock.yaml", { 
      stdio: "pipe",
      cwd: process.cwd()
    }).toString();

    // Copy lockfile to .aikido directory
    writeFileSync(LOCKFILE_PATH, lockfileContent);

    // Clean up the temporary lockfile from current directory
    try {
      unlinkSync("pnpm-lock.yaml");
    } catch (error) {
      // Ignore if file doesn't exist or can't be deleted
    }

    return { status: 0, lockfilePath: LOCKFILE_PATH };
  } catch (error) {
    // Clean up the temporary lockfile from current directory
    try {
      unlinkSync("pnpm-lock.yaml");
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    if (error.status) {
      return { status: error.status, error: error.message };
    } else {
      ui.writeError("Error generating pnpm lockfile:", error.message);
      return { status: 1, error: error.message };
    }
  }
}

export function readPnpmLockfile() {
  try {
    const lockfileContent = execSync(`cat "${LOCKFILE_PATH}"`, { 
      stdio: "pipe" 
    }).toString();
    return { status: 0, content: lockfileContent };
  } catch (error) {
    if (error.status) {
      return { status: error.status, error: error.message };
    } else {
      ui.writeError("Error reading pnpm lockfile:", error.message);
      return { status: 1, error: error.message };
    }
  }
}
