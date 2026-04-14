import { runUv } from "../uv/runUvCommand.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createUvxPackageManager() {
  return {
    /**
     * @param {string[]} args
     */
    runCommand: (args) => {
      return runUv("uvx", args);
    },
    // For uvx, rely solely on MITM
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}
