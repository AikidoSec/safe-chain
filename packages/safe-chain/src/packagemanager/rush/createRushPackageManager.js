import { runRushCommand } from "./runRushCommand.js";
import { resolvePackageVersion } from "../../api/npmApi.js";
import { parsePackagesFromRushAddArgs } from "./parsing/parsePackagesFromRushAddArgs.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
// Rush commands that download packages. Everything else (build, test, list, etc.)
// only executes scripts and should not get HTTPS_PROXY.
const RUSH_DOWNLOAD_COMMANDS = new Set(["install", "update", "add", "update-autoinstaller"]);

export function createRushPackageManager() {
  return {
    runCommand: (args) => runRushCommand("rush", args),
    // We pre-scan rush add commands and rely on MITM for install/update flows.
    isSupportedCommand: (args) => getRushCommand(args) === "add",
    getDependencyUpdatesForCommand: scanRushAddCommand,
    commandNeedsProxy(args) {
      const command = getRushCommand(args);
      return command !== undefined && RUSH_DOWNLOAD_COMMANDS.has(command);
    },
  };
}

/**
 * @param {string[]} args
 * @returns {Promise<import("../currentPackageManager.js").GetDependencyUpdatesResult[]>}
 */
async function scanRushAddCommand(args) {
  if (getRushCommand(args) !== "add") {
    return [];
  }

  const parsedSpecs = parsePackagesFromRushAddArgs(args.slice(1));

  const resolvedVersions = await Promise.all(
    parsedSpecs.map(async (parsed) => {
      const exactVersion = await resolvePackageVersion(parsed.name, parsed.version);
      return {
        parsed,
        exactVersion,
      };
    }),
  );

  const changes = [];
  for (const resolved of resolvedVersions) {
    if (!resolved.exactVersion) {
      continue;
    }

    changes.push({
      name: resolved.parsed.name,
      version: resolved.exactVersion,
      type: "add",
    });
  }

  return changes;
}

/**
 * @param {string[]} args
 * @returns {string | undefined}
 */
function getRushCommand(args) {
  if (!args || args.length === 0) {
    return undefined;
  }

  return args[0]?.toLowerCase();
}
