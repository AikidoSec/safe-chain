import { runRushCommand } from "../rush/runRushCommand.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createRushxPackageManager() {
  return {
    /**
     * @param {string[]} args
     */
    runCommand: (args) => {
      return runRushCommand("rushx", args);
    },
    // For rushx, rely solely on MITM.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}
