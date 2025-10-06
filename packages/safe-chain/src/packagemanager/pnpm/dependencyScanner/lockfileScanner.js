import { generatePnpmLockfile, readPnpmLockfile } from "../runPnpmLockfileCommand.js";
import { parsePnpmLockfile } from "../parsing/parsePnpmLockfile.js";

export function lockfileScanner() {
  return {
    scan: (args) => scanDependenciesFromLockfile(args),
    shouldScan: (args) => shouldScanDependenciesFromLockfile(args),
  };
}

function shouldScanDependenciesFromLockfile(args) {
  // Only scan for install commands without explicit packages
  // This covers cases like "pnpm install", "pnpm i", etc.
  const isInstallCommand = args.length === 1 && 
    (args[0] === "install" || args[0] === "i");
  
  return isInstallCommand;
}

async function scanDependenciesFromLockfile(args) {
  // Generate lockfile to get current dependency state
  const lockfileResult = generatePnpmLockfile(args);
  
  if (lockfileResult.status !== 0) {
    throw new Error(
      `Failed to generate pnpm lockfile with exit code ${lockfileResult.status}: ${lockfileResult.error}`
    );
  }

  // Read the generated lockfile
  const readResult = readPnpmLockfile();
  
  if (readResult.status !== 0) {
    throw new Error(
      `Failed to read pnpm lockfile: ${readResult.error}`
    );
  }

  // Parse the lockfile to extract packages
  const packages = parsePnpmLockfile(readResult.content);
  
  return packages;
}
