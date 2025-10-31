import { parsePackagesFromInstallArgs } from "../parsing/parsePackagesFromInstallArgs.js";
import { hasDryRunArg } from "../utils/pipCommands.js";

export function commandArgumentScanner(options = {}) {
  const { ignoreDryRun = false } = options;

  function shouldScan(args) {
    return shouldScanDependencies(args, ignoreDryRun);
  }

  function scan(args) {
    return scanDependencies(args);
  }

  return {
    shouldScan,
    scan,
  };
}

function shouldScanDependencies(args, ignoreDryRun) {
  return ignoreDryRun || !hasDryRunArg(args);
}

function scanDependencies(args) {
  return checkChangesFromArgs(args);
}

export function checkChangesFromArgs(args) {
  const packageUpdates = parsePackagesFromInstallArgs(args);

  // Parser already provides exact versions or "latest", no need to resolve
  // Just return the packages with type "add"
  return packageUpdates;
}
