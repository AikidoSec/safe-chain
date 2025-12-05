import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { nullScanner } from "./dependencyScanner/nullScanner.js";
import { runNpm } from "./runNpmCommand.js";
import {
  getNpmCommandForArgs,
  npmInstallCommand,
  npmUpdateCommand,
  npmExecCommand,
} from "./utils/npmCommands.js";

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
