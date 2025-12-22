import { runPipX } from "./runPipXCommand.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPipXPackageManager() {
  return {
    /**
     * @param {string[]} args
     */
    runCommand: (args) => {
      return runPipX("pipx", args);
    },
    // MITM only
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}
