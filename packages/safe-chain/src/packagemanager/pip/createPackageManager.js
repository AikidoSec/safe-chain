import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { runPip } from "./runPipCommand.js";
import {
  getPipCommandForArgs,
  pipInstallCommand,
  pipDownloadCommand,
  pipWheelCommand,
} from "./utils/pipCommands.js";

/**
 * @param {string} [command]
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPipPackageManager(command = "pip") {
  /**
   * @param {string[]} args
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
    runCommand: /** @param {string[]} args */ (args) => runPip(command, args),
    isSupportedCommand,
    getDependencyUpdatesForCommand,
  };
}

/**
 * @type {Record<string, import("./dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner>}
 */
const commandScannerMapping = {
  [pipInstallCommand]: commandArgumentScanner(),
  [pipDownloadCommand]: commandArgumentScanner(), // download also fetches packages from PyPI
  [pipWheelCommand]: commandArgumentScanner(), // wheel downloads and builds packages
  // Other commands return null scanner by default
};

/**
 * @returns {import("./dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner}
 */
function nullScanner() {
  return {
    shouldScan: () => false,
    scan: () => [],
  };
}

/**
 * @param {Record<string, import("./dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner>} scanners
 * @param {string[]} args
 * @returns {import("./dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner}
 */
function findDependencyScannerForCommand(scanners, args) {
  const command = getPipCommandForArgs(args);
  if (!command) {
    return nullScanner();
  }

  const scanner = scanners[command];
  return scanner || nullScanner();
}
