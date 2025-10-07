import { matchesCommand } from "../_shared/matchesCommand.js";
import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { lockfileScanner } from "./dependencyScanner/lockfileScanner.js";
import { runPnpmCommand } from "./runPnpmCommand.js";

const commandScanner = commandArgumentScanner();
const lockfileScannerInstance = lockfileScanner();

export function createPnpmPackageManager() {
  return {
    runCommand: (args) => runPnpmCommand(args, "pnpm"),
    isSupportedCommand: (args) =>
      matchesCommand(args, "add") ||
      matchesCommand(args, "update") ||
      matchesCommand(args, "upgrade") ||
      matchesCommand(args, "up") ||
      matchesCommand(args, "install") ||
      matchesCommand(args, "i") ||
      // dlx does not always come in the first position
      // eg: pnpm --package=yo --package=generator-webapp dlx yo webapp
      // documentation: https://pnpm.io/cli/dlx#--package-name
      args.includes("dlx"),
    getDependencyUpdatesForCommand: (args) =>
      getDependencyUpdatesForCommand(args, false),
  };
}

export function createPnpxPackageManager() {
  return {
    runCommand: (args) => runPnpmCommand(args, "pnpx"),
    isSupportedCommand: () => true,
    getDependencyUpdatesForCommand: (args) =>
      getDependencyUpdatesForCommand(args, true),
  };
}

function getDependencyUpdatesForCommand(args, isPnpx) {
  if (isPnpx) {
    return commandScanner.scan(args);
  }
  if (args.includes("dlx")) {
    // dlx is not always the first argument (eg: `pnpm --package=yo --package=generator-webapp dlx yo webapp`)
    // so we need to filter it out instead of slicing the array
    // documentation: https://pnpm.io/cli/dlx#--package-name
    return commandScanner.scan(args.filter((arg) => arg !== "dlx"));
  }
  
  // Check if we should use lockfile scanner for install commands without explicit packages
  if (lockfileScannerInstance.shouldScan(args)) {
    return lockfileScannerInstance.scan(args);
  }
  
  // Fall back to command argument scanner for explicit package arguments
  return commandScanner.scan(args.slice(1));
}
