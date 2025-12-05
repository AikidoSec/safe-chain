import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { runNpx } from "./runNpxCommand.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createNpxPackageManager() {
  const scanner = commandArgumentScanner();

  return {
    runCommand: runNpx,
    isSupportedCommand: (args) => scanner.shouldScan(args),
    getDependencyUpdatesForCommand: (args) => scanner.scan(args),
  };
}
