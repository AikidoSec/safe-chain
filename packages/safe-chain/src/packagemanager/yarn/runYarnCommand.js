import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";
import { ui } from "../../environment/userInteraction.js";

// Yarn proxy-related options that could bypass Safe Chain's interceptor
const FORBIDDEN_YARN_OPTIONS = new Set([
  "--proxy",
  "--https-proxy",
  "--http-proxy",
]);

// Yarn-specific environment variables that could override Safe Chain's proxy
const FORBIDDEN_YARN_ENV_VARS = [
  "yarn_https_proxy",
  "yarn_proxy",
  "YARN_PROXY",
];

/**
 * Filters out proxy-related command-line arguments that could bypass Safe Chain's interceptor.
 * Yarn's command-line proxy options can override environment variables, so we must reject them
 * to ensure registry traffic goes through the Safe Chain proxy.
 *
 * @param {string[]} args
 * @returns {string[]}
 */
function filterProxyArguments(args) {
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

    if (FORBIDDEN_YARN_OPTIONS.has(optionName)) {
      ui.writeWarning(
        `Safe-chain: Ignoring yarn proxy option '${arg}' to enforce Safe Chain's registry interceptor.`
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
 * Removes yarn-specific proxy environment variables that could override Safe Chain's proxy.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
function removeYarnProxyEnvironmentVariables(env) {
  const cleaned = { ...env };

  for (const varName of FORBIDDEN_YARN_ENV_VARS) {
    if (cleaned[varName] !== undefined) {
      ui.writeWarning(
        `Safe-chain: Removing environment variable '${varName}' to enforce Safe Chain's registry interceptor.`
      );
      delete cleaned[varName];
    }
  }

  return cleaned;
}

/**
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runYarnCommand(args) {
  try {
    // Filter out proxy-related command-line arguments that could bypass Safe Chain
    const filteredArgs = filterProxyArguments(args);

    // Merge Safe Chain's proxy environment variables and remove yarn-specific proxy vars
    let env = mergeSafeChainProxyEnvironmentVariables(process.env);
    env = removeYarnProxyEnvironmentVariables(env);
    
    await fixYarnProxyEnvironmentVariables(env);

    const result = await safeSpawn("yarn", filteredArgs, {
      stdio: "inherit",
      env,
    });
    return { status: result.status };
  } catch (/** @type any */ error) {
    return reportCommandExecutionFailure(error, "yarn");
  }
}

/**
 * @param {Record<string, string>} env
 *
 * @returns {Promise<void>}
 */
async function fixYarnProxyEnvironmentVariables(env) {
  // Yarn ignores standard proxy environment variable HTTPS_PROXY
  // It does respect NODE_EXTRA_CA_CERTS for custom CA certificates though.
  // Don't use YARN_HTTPS_CA_FILE_PATH or YARN_CA_FILE_PATH though, it causes yarn to ignore all system CAs

  env.YARN_HTTPS_PROXY = env.HTTPS_PROXY;
}
