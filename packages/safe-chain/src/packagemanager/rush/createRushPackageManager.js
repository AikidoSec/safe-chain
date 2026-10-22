import { runRushCommand } from "./runRushCommand.js";
import { resolvePackageVersion } from "../../api/npmApi.js";
import { parsePackagesFromRushAddArgs } from "./parsing/parsePackagesFromRushAddArgs.js";

// Rush commands that download packages. Everything else (build, test, list, etc.)
// only executes scripts and should not get HTTPS_PROXY.
const RUSH_DOWNLOAD_COMMANDS = new Set(["install", "update", "add", "update-autoinstaller"]);

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */

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
 * Checks if a package specification is a non-registry source (URL, Git, file path, etc.)
 * that cannot be validated against the malware database.
 * 
 * @param {string} packageName
 * @returns {boolean}
 */
function isNonRegistryPackageSpec(packageName) {
  // Detect URL protocols (http, https, git, git+https, git+ssh, etc.)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(packageName)) {
    return true;
  }
  
  // Detect Git hosting shortcuts (github:, gitlab:, bitbucket:, gist:)
  if (/^(github|gitlab|bitbucket|gist):/i.test(packageName)) {
    return true;
  }
  
  // Detect file: protocol
  if (/^file:/i.test(packageName)) {
    return true;
  }
  
  // Detect relative paths (./, ../)
  if (/^\.\.?[/\\]/.test(packageName)) {
    return true;
  }
  
  // Detect absolute paths (Unix: /, Windows: C:\, \\)
  if (/^([/\\]|[a-z]:[/\\])/i.test(packageName)) {
    return true;
  }
  
  return false;
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

  // Validate all package specs before resolving versions
  for (const parsed of parsedSpecs) {
    if (isNonRegistryPackageSpec(parsed.name)) {
      throw new Error(
        `Safe-chain: Cannot install package from non-registry source: ${parsed.name}. ` +
        `Only packages from the npm registry can be scanned for malware. ` +
        `Direct URLs, Git repositories, file paths, and tarballs are not supported.`
      );
    }
  }

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
