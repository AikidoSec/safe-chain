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

  const packageSpecs = extractRushAddPackageSpecs(args);
  const changes = [];

  for (const spec of packageSpecs) {
    const parsed = parsePackageSpec(spec);
    if (!parsed) {
      continue;
    }

    const exactVersion = await resolvePackageVersion(parsed.name, parsed.version);
    if (!exactVersion) {
      continue;
    }

    changes.push({
      name: parsed.name,
      version: exactVersion,
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
