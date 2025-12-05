import { matchesCommand } from "../_shared/matchesCommand.js";
import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { runPnpmCommand } from "./runPnpmCommand.js";

const scanner = commandArgumentScanner();

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPnpmPackageManager() {
  return {
    runCommand: (args) => runPnpmCommand(args, "pnpm"),
    isSupportedCommand: (args) =>
      matchesCommand(args, "add") ||
      matchesCommand(args, "update") ||
      matchesCommand(args, "upgrade") ||
      matchesCommand(args, "up") ||
      matchesCommand(args, "install") ||
      matchesCommand(args, "i") ||
      // dlx does not always come in the first position
      // eg: pnpm --package=yo --package=generator-webapp dlx yo webapp
      // documentation: https://pnpm.io/cli/dlx#--package-name
      args.includes("dlx"),
    getDependencyUpdatesForCommand: (args) =>
      getDependencyUpdatesForCommand(args, false),
  };
}

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPnpxPackageManager() {
  return {
    runCommand: (args) => runPnpmCommand(args, "pnpx"),
    isSupportedCommand: () => true,
    getDependencyUpdatesForCommand: (args) =>
      getDependencyUpdatesForCommand(args, true),
  };
}

/**
 * @param {string[]} args
 * @param {boolean} isPnpx
 * @returns {ReturnType<import("../currentPackageManager.js").PackageManager["getDependencyUpdatesForCommand"]>}
 */
function getDependencyUpdatesForCommand(args, isPnpx) {
  if (isPnpx) {
    return scanner.scan(args);
  }
  if (args.includes("dlx")) {
    // dlx is not always the first argument (eg: `pnpm --package=yo --package=generator-webapp dlx yo webapp`)
    // so we need to filter it out instead of slicing the array
    // documentation: https://pnpm.io/cli/dlx#--package-name
    return scanner.scan(args.filter((arg) => arg !== "dlx"));
  }
  return scanner.scan(args.slice(1));
}
