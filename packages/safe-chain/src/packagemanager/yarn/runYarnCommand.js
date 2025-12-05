import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";

/**
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runYarnCommand(args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);
    await fixYarnProxyEnvironmentVariables(env);

    const result = await safeSpawn("yarn", args, {
      stdio: "inherit",
      env,
    });
    return { status: result.status };
  } catch (/** @type any */ error) {
    if (error.status) {
      return { status: error.status };
    } else {
      ui.writeError("Error executing command:", error.message);
      return { status: 1 };
    }
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
