import { runPip } from "./runPipCommand.js";

/**
 * @param {string} [command]
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPipPackageManager(command = "pip") {
  return {
    runCommand: /** @param {string[]} args */ (args) => runPip(command, args),
    // For pip, rely solely on MITM proxy to detect/deny downloads from known registries.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}

