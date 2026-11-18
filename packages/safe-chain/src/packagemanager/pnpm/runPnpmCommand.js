import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";
import { ui } from "../../environment/userInteraction.js";

// pnpm proxy-related options that could bypass Safe Chain's interceptor
const FORBIDDEN_PNPM_OPTIONS = new Set([
  "--proxy",
  "--https-proxy",
  "--http-proxy",
  "--noproxy",
]);

// pnpm-specific environment variables that could override Safe Chain's proxy
const FORBIDDEN_PNPM_ENV_VARS = [
  "npm_config_proxy",
  "npm_config_https_proxy",
  "npm_config_http_proxy",
  "npm_config_noproxy",
  "NPM_CONFIG_PROXY",
  "NPM_CONFIG_HTTPS_PROXY",
  "NPM_CONFIG_HTTP_PROXY",
  "NPM_CONFIG_NOPROXY",
];

/**
 * Filters out proxy-related command-line arguments that could bypass Safe Chain's interceptor.
 * pnpm respects npm's proxy configuration, so we must filter these options.
 *
 * @param {string[]} args
 * @param {string} toolName
 * @returns {string[]}
 */
function filterProxyArguments(args, toolName) {
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

    if (FORBIDDEN_PNPM_OPTIONS.has(optionName)) {
      ui.writeWarning(
        `Safe-chain: Ignoring ${toolName} proxy option '${arg}' to enforce Safe Chain's registry interceptor.`
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
 * Removes pnpm/npm-specific proxy environment variables that could override Safe Chain's proxy.
 * pnpm respects npm's configuration system.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
function removePnpmProxyEnvironmentVariables(env) {
  const cleaned = { ...env };

  for (const varName of FORBIDDEN_PNPM_ENV_VARS) {
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
 * Sets npm-specific proxy environment variables to enforce Safe Chain's proxy.
 * pnpm respects npm's configuration system, so we set npm_config_* variables.
 *
 * @param {Record<string, string>} env
 * @returns {Record<string, string>}
 */
function setPnpmProxyEnvironmentVariables(env) {
  const proxyUrl = env.HTTPS_PROXY;
  
  if (!proxyUrl) {
    return env;
  }

  // Set npm-specific proxy variables that pnpm respects
  return {
    ...env,
    npm_config_https_proxy: proxyUrl,
    npm_config_proxy: proxyUrl,
    // Disable noproxy to ensure all registry traffic goes through the proxy
    npm_config_noproxy: "",
  };
}

/**
 * @param {string[]} args
 * @param {string} [toolName]
 * @returns {Promise<{status: number}>}
 */
export async function runPnpmCommand(args, toolName = "pnpm") {
  try {
    // Filter out proxy-related command-line arguments that could bypass Safe Chain
    const filteredArgs = filterProxyArguments(args, toolName);

    // Merge Safe Chain's proxy environment variables and remove pnpm-specific proxy vars
    let env = mergeSafeChainProxyEnvironmentVariables(process.env);
    env = removePnpmProxyEnvironmentVariables(env);
    
    // Set npm-specific proxy variables that pnpm respects
    env = setPnpmProxyEnvironmentVariables(env);

    let result;
    if (toolName === "pnpm") {
      result = await safeSpawn("pnpm", filteredArgs, {
        stdio: "inherit",
        env,
      });
    } else if (toolName === "pnpx") {
      result = await safeSpawn("pnpx", filteredArgs, {
        stdio: "inherit",
        env,
      });
    } else {
      throw new Error(`Unsupported tool name for aikido-pnpm: ${toolName}`);
    }

    return { status: result.status };
  } catch (/** @type any */ error) {
    const target = toolName === "pnpm" ? "pnpm" : "pnpx";
    return reportCommandExecutionFailure(error, target);
  }
}
