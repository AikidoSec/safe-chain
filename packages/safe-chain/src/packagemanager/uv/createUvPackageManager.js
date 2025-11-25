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
      // uv is always invoked as 'uv' - no invocation variations like pip
      return runUv("uv", args);
    },
    // For uv, rely solely on MITM proxy to detect/deny downloads from PyPI.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}
