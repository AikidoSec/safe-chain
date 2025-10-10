import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { nullScanner } from "./dependencyScanner/nullScanner.js";
import { runNpm } from "./runNpmCommand.js";
import {
  getNpmCommandForArgs,
  npmInstallCommand,
  npmUpdateCommand,
  npmExecCommand,
} from "./utils/npmCommands.js";

export function createNpmPackageManager() {
  function isSupportedCommand(args) {
    const scanner = findDependencyScannerForCommand(
      commandScannerMapping,
      args
    );
    return scanner.shouldScan(args);
  }

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

const commandScannerMapping = {
  [npmInstallCommand]: commandArgumentScanner(),
  [npmUpdateCommand]: commandArgumentScanner(),
  [npmExecCommand]: commandArgumentScanner({ ignoreDryRun: true }), // exec command doesn't support dry-run
};

function findDependencyScannerForCommand(scanners, args) {
  const command = getNpmCommandForArgs(args);
  if (!command) {
    return nullScanner();
  }

  const scanner = scanners[command];
  return scanner ? scanner : nullScanner();
}
