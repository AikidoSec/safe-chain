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
    // rushx runs scripts that can invoke npm/pnpm without going through the
    // safe-chain shim (Rush uses sh subshells that don't source the zsh function
    // wrappers). The proxy must be started so HTTPS_PROXY is set as a fallback
    // protection for those inner package-manager calls.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
    commandNeedsProxy: () => true,
  };
}
