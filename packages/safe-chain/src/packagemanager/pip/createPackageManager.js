import { runPip } from "./runPipCommand.js";
import { PIP_COMMAND } from "./pipSettings.js";

/**
 * @param {{ tool: string, args: string[] }} [context] - Optional context with tool name and args
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPipPackageManager(context) {
  const tool = context?.tool || PIP_COMMAND;

  return {
    /**
     * @param {string[]} args
     */
    runCommand: (args) => {
      // Args from main.js are already stripped of --safe-chain-* flags
      // We just pass the tool (e.g. "python3") and the args (e.g. ["-m", "pip", "install", ...])
      return runPip(tool, args);
    },
    // For pip, rely solely on MITM proxy to detect/deny downloads from known registries.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}

