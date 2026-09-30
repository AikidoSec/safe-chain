import { matchesCommand } from "../_shared/matchesCommand.js";
import { commandArgumentScanner } from "./dependencyScanner/commandArgumentScanner.js";
import { runPnpmCommand } from "./runPnpmCommand.js";

// pnpm commands that only execute scripts and never download packages.
// `exec` runs a pre-installed binary in project context; `node` runs Node.js.
const PNPM_LIFECYCLE_COMMANDS = new Set(["run", "exec", "node", "test", "start", "stop", "restart"]);

// `publish` and `stage` download no packages, and pnpm >= 12's OIDC token
// exchange ignores NODE_EXTRA_CA_CERTS, so it rejects safe-chain's MITM
// certificate (#596). Installs from lifecycle scripts are still caught by the shims.
const PNPM_NO_PROXY_COMMANDS = new Set([...PNPM_LIFECYCLE_COMMANDS, "publish", "stage"]);

// Global flags whose value is a separate argument, which must be skipped when
// looking for the subcommand. eg: pnpm --dir ./packages/foo publish
const PNPM_GLOBAL_FLAGS_WITH_VALUE = new Set([
  "-C",
  "--dir",
  "-F",
  "--filter",
  "--filter-prod",
  "--test-pattern",
  "--changed-files-ignore-pattern",
  "--workspace-concurrency",
  "--reporter",
  "--loglevel",
  "--registry",
]);

const scanner = commandArgumentScanner();

/**
 * @param {string[]} args
 * @returns {string | undefined}
 */
function findPnpmSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("-")) {
      return arg.toLowerCase();
    }
    if (PNPM_GLOBAL_FLAGS_WITH_VALUE.has(arg)) {
      i++;
    }
  }
  return undefined;
}

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
    commandNeedsProxy(args) {
      const command = findPnpmSubcommand(args);
      return !command || !PNPM_NO_PROXY_COMMANDS.has(command);
    },
  };
}

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPnpxPackageManager() {
  return {
    runCommand: (args) => runPnpmCommand(args, "pnpx"),
    isSupportedCommand: () => true,
    commandNeedsProxy: () => true,
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
