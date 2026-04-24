import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";

/**
 * @param {string[]} args
 * @returns {Promise<{status: number}>}
 */
export async function runRushCommand(args) {
  try {
    const env = normalizeProxyEnvironmentVariables(
      mergeSafeChainProxyEnvironmentVariables(process.env),
    );

    const result = await safeSpawn("rush", args, {
      stdio: "inherit",
      env,
    });

    return { status: result.status };
  } catch (/** @type any */ error) {
    return reportCommandExecutionFailure(error, "rush");
  }
}

/**
 * Ensure proxy settings are visible to package manager variants that rely on
 * lowercase or npm/yarn-specific environment variables.
 *
 * @param {Record<string, string>} env
 * @returns {Record<string, string>}
 */
function normalizeProxyEnvironmentVariables(env) {
  const normalized = {
    ...env,
  };

  if (normalized.HTTPS_PROXY && !normalized.HTTP_PROXY) {
    normalized.HTTP_PROXY = normalized.HTTPS_PROXY;
  }

  if (normalized.HTTP_PROXY && !normalized.http_proxy) {
    normalized.http_proxy = normalized.HTTP_PROXY;
  }

  if (normalized.HTTPS_PROXY && !normalized.https_proxy) {
    normalized.https_proxy = normalized.HTTPS_PROXY;
  }

  if (normalized.HTTP_PROXY && !normalized.npm_config_proxy) {
    normalized.npm_config_proxy = normalized.HTTP_PROXY;
  }

  if (normalized.HTTPS_PROXY && !normalized.npm_config_https_proxy) {
    normalized.npm_config_https_proxy = normalized.HTTPS_PROXY;
  }

  if (normalized.HTTP_PROXY && !normalized.NPM_CONFIG_PROXY) {
    normalized.NPM_CONFIG_PROXY = normalized.HTTP_PROXY;
  }

  if (normalized.HTTPS_PROXY && !normalized.NPM_CONFIG_HTTPS_PROXY) {
    normalized.NPM_CONFIG_HTTPS_PROXY = normalized.HTTPS_PROXY;
  }

  if (normalized.HTTPS_PROXY && !normalized.YARN_HTTPS_PROXY) {
    normalized.YARN_HTTPS_PROXY = normalized.HTTPS_PROXY;
  }

  return normalized;
}
