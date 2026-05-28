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
    // rushx only runs lifecycle scripts (equivalent to npm run for Rush monorepos).
    // It never downloads packages, so the proxy is never needed.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
    commandNeedsProxy: () => false,
  };
}
