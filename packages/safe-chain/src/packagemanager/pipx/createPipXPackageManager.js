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
    // For uv, rely solely on MITM
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}
