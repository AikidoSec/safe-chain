import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { runPip } from "./runPipCommand.js";
import {
  getPipCommandForArgs,
  pipInstallCommand,
  pipDownloadCommand,
  pipWheelCommand,
} from "./utils/pipCommands.js";

export function createPipPackageManager(command = "pip") {
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
    runCommand: (args) => runPip(command, args),
    isSupportedCommand,
    getDependencyUpdatesForCommand,
  };
}

const commandScannerMapping = {
  [pipInstallCommand]: commandArgumentScanner(),
  [pipDownloadCommand]: commandArgumentScanner(), // download also fetches packages from PyPI
  [pipWheelCommand]: commandArgumentScanner(), // wheel downloads and builds packages
  // Other commands return null scanner by default
};

const NULL_SCANNER = {
  shouldScan: () => false,
  scan: () => [],
};

function findDependencyScannerForCommand(scanners, args) {
  const command = getPipCommandForArgs(args);
  if (!command) {
    return NULL_SCANNER;
  }

  const scanner = scanners[command];
  return scanner || NULL_SCANNER;
}
