import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { runYarnCommand } from "./runYarnCommand.js";

const scanner = commandArgumentScanner();

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createYarnPackageManager() {
  return {
    runCommand: runYarnCommand,
    isSupportedCommand: (args) =>
      matchesCommand(args, "add") ||
      matchesCommand(args, "global", "add") ||
      matchesCommand(args, "install") ||
      matchesCommand(args, "up") ||
      matchesCommand(args, "upgrade") ||
      matchesCommand(args, "global", "upgrade") ||
      matchesCommand(args, "dlx"),
    getDependencyUpdatesForCommand: (args) => scanner.scan(args),
  };
}

/**
 * @param {string[]} args
 * @param {...string} commandArgs
 * @returns {boolean}
 */
function matchesCommand(args, ...commandArgs) {
  if (args.length < commandArgs.length) {
    return false;
  }

  for (var i = 0; i < commandArgs.length; i++) {
    if (args[i].toLowerCase() !== commandArgs[i].toLowerCase()) {
      return false;
    }
  }

  return true;
}
