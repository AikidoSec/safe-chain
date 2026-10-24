import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";
import { ui } from "../../environment/userInteraction.js";

// npm/npx proxy-related options that could bypass Safe Chain's interceptor
const FORBIDDEN_NPM_OPTIONS = new Set([
  "--proxy",
  "--https-proxy",
  "--http-proxy",
  "--noproxy",
  "--no-proxy",
]);

// npm-specific environment variables that take precedence over generic HTTPS_PROXY
const FORBIDDEN_NPM_ENV_VARS = [
  "npm_config_proxy",
  "npm_config_https_proxy",
  "npm_config_https_proxy",
  "npm_config_http_proxy",
  "npm_config_noproxy",
  "npm_config_no_proxy",
  "NPM_CONFIG_PROXY",
  "NPM_CONFIG_HTTPS_PROXY",
  "NPM_CONFIG_HTTP_PROXY",
  "NPM_CONFIG_NOPROXY",
  "NPM_CONFIG_NO_PROXY",
];

/**
 * Filters out proxy-related command-line arguments that could bypass Safe Chain's interceptor.
 * npx uses npm's configuration system, so npm's command-line proxy options take precedence
 * over environment variables. We must reject them to ensure registry traffic goes through
 * the Safe Chain proxy.
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

    if (FORBIDDEN_NPM_OPTIONS.has(optionName)) {
      ui.writeWarning(
        `Safe-chain: Ignoring npx proxy option '${arg}' to enforce Safe Chain's registry interceptor.`
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
 * Removes npm-specific proxy environment variables that take precedence over generic HTTPS_PROXY.
 * npx uses npm's configuration system, so npm_config_* variables must be removed to ensure
 * Safe Chain's proxy configuration is used.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
function removeNpmProxyEnvironmentVariables(env) {
  const cleaned = { ...env };

  for (const varName of FORBIDDEN_NPM_ENV_VARS) {
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
 * npx uses npm's configuration system where: command-line > env vars > .npmrc files.
 * By setting npm_config_* variables, we override any .npmrc proxy settings.
 *
 * @param {Record<string, string>} env
 * @returns {Record<string, string>}
 */
function setNpmProxyEnvironmentVariables(env) {
  const proxyUrl = env.HTTPS_PROXY;
  
  if (!proxyUrl) {
    return env;
  }

  // Set npm-specific proxy variables to override .npmrc settings
  // npm_config_https_proxy takes precedence over .npmrc proxy configuration
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
 *
 * @returns {Promise<{status: number}>}
 */
export async function runNpx(args) {
  try {
    // Filter out proxy-related command-line arguments that could bypass Safe Chain
    const filteredArgs = filterProxyArguments(args);

    // Merge Safe Chain's proxy environment variables and remove npm-specific proxy vars
    let env = mergeSafeChainProxyEnvironmentVariables(process.env);
    env = removeNpmProxyEnvironmentVariables(env);
    
    // Set npm-specific proxy variables to override .npmrc settings
    env = setNpmProxyEnvironmentVariables(env);

    const result = await safeSpawn("npx", filteredArgs, {
      stdio: "inherit",
      env,
    });
    return { status: result.status };
  } catch (/** @type any */ error) {
    return reportCommandExecutionFailure(error, "npx");
  }
}
