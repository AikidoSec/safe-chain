import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";

/**
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runNpm(args) {
  try {
    const result = await safeSpawn("npm", args, {
      stdio: "inherit",
      env: mergeSafeChainProxyEnvironmentVariables(process.env),
    });
    return { status: result.status };
  } catch (/** @type any */ error) {
    return reportCommandExecutionFailure(error, "npm");
  }
}
