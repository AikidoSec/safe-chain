import { runRushCommand } from "./runRushCommand.js";
import { resolvePackageVersion } from "../../api/npmApi.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createRushPackageManager() {
  return {
    runCommand: runRushCommand,
    // We pre-scan rush add commands and rely on MITM for install/update flows.
    isSupportedCommand: (args) => getRushCommand(args) === "add",
    getDependencyUpdatesForCommand: scanRushAddCommand,
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

  const parsedSpecs = extractRushAddPackageSpecs(args)
    .map((spec) => parsePackageSpec(spec))
    .filter((spec) => spec !== null);

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

/**
 * @param {string[]} args
 * @returns {string[]}
 */
function extractRushAddPackageSpecs(args) {
  const packageSpecs = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--package" || arg === "-p") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        packageSpecs.push(next);
        i += 1;
      }
      continue;
    }

    if (arg.startsWith("--package=")) {
      const value = arg.slice("--package=".length);
      if (value) {
        packageSpecs.push(value);
      }
      continue;
    }

    if (!arg.startsWith("-")) {
      packageSpecs.push(arg);
    }
  }

  return packageSpecs;
}

/**
 * @param {string} spec
 * @returns {{name: string, version: string | null} | null}
 */
function parsePackageSpec(spec) {
  const value = removeAlias(spec.trim());
  if (!value) {
    return null;
  }

  const lastAtIndex = value.lastIndexOf("@");
  if (lastAtIndex > 0) {
    return {
      name: value.slice(0, lastAtIndex),
      version: value.slice(lastAtIndex + 1),
    };
  }

  return {
    name: value,
    version: null,
  };
}

/**
 * @param {string} spec
 * @returns {string}
 */
function removeAlias(spec) {
  const aliasIndex = spec.indexOf("@npm:");
  if (aliasIndex !== -1) {
    return spec.slice(aliasIndex + 5);
  }

  return spec;
}
