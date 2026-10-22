import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";
import { ui } from "../../environment/userInteraction.js";

// bun commands that only execute scripts; they never download packages.
const BUN_LIFECYCLE_COMMANDS = new Set(["run", "test"]);

// Bun proxy-related options that could bypass Safe Chain's interceptor
const FORBIDDEN_BUN_OPTIONS = new Set([
  "--proxy",
  "--https-proxy",
  "--http-proxy",
]);

// Bun respects standard HTTP_PROXY/HTTPS_PROXY environment variables
// We need to ensure no overriding variables are present
const FORBIDDEN_BUN_ENV_VARS = [
  "http_proxy",
  "HTTP_PROXY",
  "ALL_PROXY",
  "all_proxy",
];

/**
 * Filters out proxy-related command-line arguments that could bypass Safe Chain's interceptor.
 *
 * @param {string[]} args
 * @param {string} command
 * @returns {string[]}
 */
function filterProxyArguments(args, command) {
  const filtered = [];
  let skipNext = false;

  for (let i = 0; i < args.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const arg = args[i];
    const lowerArg = arg.toLowerCase();

    // Check for --option=value format
    const hasEquals = arg.includes("=");
    const optionName = hasEquals ? lowerArg.split("=")[0] : lowerArg;

    if (FORBIDDEN_BUN_OPTIONS.has(optionName)) {
      ui.writeWarning(
        `Safe-chain: Ignoring ${command} proxy option '${arg}' to enforce Safe Chain's registry interceptor.`
      );
      // If --option value format (no equals), skip the next argument too
      if (!hasEquals && i + 1 < args.length && !args[i + 1].startsWith("-")) {
        skipNext = true;
      }
      continue;
    }

    filtered.push(arg);
  }

  return filtered;
}

/**
 * Removes environment variables that could override Safe Chain's HTTPS_PROXY.
 * Bun respects standard proxy environment variables, so we need to ensure
 * only HTTPS_PROXY is set (which is set by Safe Chain).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
function removeBunProxyEnvironmentVariables(env) {
  const cleaned = { ...env };

  for (const varName of FORBIDDEN_BUN_ENV_VARS) {
    // Only remove if it differs from Safe Chain's HTTPS_PROXY
    if (cleaned[varName] !== undefined && varName.toUpperCase() !== "HTTPS_PROXY") {
      ui.writeWarning(
        `Safe-chain: Removing environment variable '${varName}' to enforce Safe Chain's registry interceptor.`
      );
      delete cleaned[varName];
    }
  }

  return cleaned;
}

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */

export function createBunPackageManager() {
  return {
    runCommand: (args) => runBunCommand("bun", args),

    // For bun, we use the proxy-only approach to block package downloads,
    // so we don't need to analyze commands.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
    commandNeedsProxy(args) {
      const command = args.find((arg) => !arg.startsWith("-"))?.toLowerCase();
      return !command || !BUN_LIFECYCLE_COMMANDS.has(command);
    },
  };
}

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createBunxPackageManager() {
  return {
    runCommand: (args) => runBunCommand("bunx", args),

    // For bunx, we use the proxy-only approach to block package downloads,
    // so we don't need to analyze commands.
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
    commandNeedsProxy: () => true,
  };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{status: number}>}
 */
async function runBunCommand(command, args) {
  try {
    // Filter out proxy-related command-line arguments that could bypass Safe Chain
    const filteredArgs = filterProxyArguments(args, command);

    // Merge Safe Chain's proxy environment variables and remove conflicting proxy vars
    let env = mergeSafeChainProxyEnvironmentVariables(process.env);
    env = removeBunProxyEnvironmentVariables(env);

    const result = await safeSpawn(command, filteredArgs, {
      stdio: "inherit",
      env,
    });
    return { status: result.status };
  } catch (/** @type any */ error) {
    return reportCommandExecutionFailure(error, command);
  }
}
