import { runPip } from "./runPipCommand.js";
import { getCurrentPipInvocation } from "./pipSettings.js";
/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPipPackageManager() {
  return {
    /**
     * @param {string[]} args
     */
    runCommand: (args) => {
      const invocation = getCurrentPipInvocation();
      const fullArgs = [...invocation.args, ...args];
      return runPip(invocation.command, fullArgs);
    },
    // For pip, rely solely on MITM proxy to detect/deny downloads from known registries.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}

