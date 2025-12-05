import { runUv } from "./runUvCommand.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createUvPackageManager() {
  return {
    /**
     * @param {string[]} args
     */
    runCommand: (args) => {
      return runUv("uv", args);
    },
    // For uv, rely solely on MITM
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}
