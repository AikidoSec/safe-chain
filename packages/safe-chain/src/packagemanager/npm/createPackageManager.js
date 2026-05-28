import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { nullScanner } from "./dependencyScanner/nullScanner.js";
import { runNpm } from "./runNpmCommand.js";
import {
  getNpmCommandForArgs,
  npmInstallCommand,
  npmUpdateCommand,
  npmExecCommand,
} from "./utils/npmCommands.js";

// These npm commands only execute lifecycle scripts; they never download packages
// themselves. Nested npm install/ci/etc. calls within those scripts are
// re-intercepted by the shims in PATH.
const NPM_LIFECYCLE_COMMANDS = new Set(["run", "start", "stop", "restart", "test"]);

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createNpmPackageManager() {
  /**
   * @param {string[]} args
   *
   * @returns {boolean}
   */
  function isSupportedCommand(args) {
    const scanner = findDependencyScannerForCommand(
      commandScannerMapping,
      args
    );
    return scanner.shouldScan(args);
  }

  /**
   * @param {string[]} args
   *
   * @returns {ReturnType<import("../currentPackageManager.js").PackageManager["getDependencyUpdatesForCommand"]>}
   */
  function getDependencyUpdatesForCommand(args) {
    const scanner = findDependencyScannerForCommand(
      commandScannerMapping,
      args
    );
    return scanner.scan(args);
  }

  return {
    runCommand: runNpm,
    isSupportedCommand,
    getDependencyUpdatesForCommand,
    commandNeedsProxy(args) {
      const command = getNpmCommandForArgs(args);
      return command === null || !NPM_LIFECYCLE_COMMANDS.has(command);
    },
  };
}

/**
 * @type {Record<string, import("./dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner>}
 */
const commandScannerMapping = {
  [npmInstallCommand]: commandArgumentScanner(),
  [npmUpdateCommand]: commandArgumentScanner(),
  [npmExecCommand]: commandArgumentScanner({ ignoreDryRun: true }), // exec command doesn't support dry-run
};

/**
 *
 * @param {Record<string, import("./dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner>} scanners
 * @param {string[]} args
 *
 * @returns {import("./dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner}
 */
function findDependencyScannerForCommand(scanners, args) {
  const command = getNpmCommandForArgs(args);
  if (!command) {
    return nullScanner();
  }

  const scanner = scanners[command];
  return scanner ? scanner : nullScanner();
}
