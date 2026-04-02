import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";

/**
 * @param {string[]} args
 * @returns {Promise<{status: number}>}
 */
export async function runRushCommand(args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);
    normalizeProxyEnvironmentVariables(env);

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
 */
function normalizeProxyEnvironmentVariables(env) {
  if (env.HTTPS_PROXY && !env.HTTP_PROXY) {
    env.HTTP_PROXY = env.HTTPS_PROXY;
  }

  if (env.HTTP_PROXY && !env.http_proxy) {
    env.http_proxy = env.HTTP_PROXY;
  }

  if (env.HTTPS_PROXY && !env.https_proxy) {
    env.https_proxy = env.HTTPS_PROXY;
  }

  if (env.HTTP_PROXY && !env.npm_config_proxy) {
    env.npm_config_proxy = env.HTTP_PROXY;
  }

  if (env.HTTPS_PROXY && !env.npm_config_https_proxy) {
    env.npm_config_https_proxy = env.HTTPS_PROXY;
  }

  if (env.HTTP_PROXY && !env.NPM_CONFIG_PROXY) {
    env.NPM_CONFIG_PROXY = env.HTTP_PROXY;
  }

  if (env.HTTPS_PROXY && !env.NPM_CONFIG_HTTPS_PROXY) {
    env.NPM_CONFIG_HTTPS_PROXY = env.HTTPS_PROXY;
  }

  if (env.HTTPS_PROXY && !env.YARN_HTTPS_PROXY) {
    env.YARN_HTTPS_PROXY = env.HTTPS_PROXY;
  }
}
