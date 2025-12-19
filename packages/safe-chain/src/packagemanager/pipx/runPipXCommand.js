import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { getCombinedCaBundlePath } from "../../registryProxy/certBundle.js";

/**
 * Sets CA bundle environment variables used by Python libraries and pipx.
 * 
 * @param {NodeJS.ProcessEnv} env - Env object
 * @param {string} combinedCaPath - Path to the combined CA bundle
 * @return {NodeJS.ProcessEnv} Modified environment object
 */
function getPipXCaBundleEnvironmentVariables(env, combinedCaPath) {
  let retVal = { ...env };

  if (env.SSL_CERT_FILE) {
    ui.writeWarning("Safe-chain: User defined SSL_CERT_FILE found in environment. It will be overwritten.");
  }
  retVal.SSL_CERT_FILE = combinedCaPath;

  if (env.REQUESTS_CA_BUNDLE) {
    ui.writeWarning("Safe-chain: User defined REQUESTS_CA_BUNDLE found in environment. It will be overwritten.");
  }
  retVal.REQUESTS_CA_BUNDLE = combinedCaPath;

  if (env.PIP_CERT) {
    ui.writeWarning("Safe-chain: User defined PIP_CERT found in environment. It will be overwritten.");
  }
  retVal.PIP_CERT = combinedCaPath;
  return retVal;
}

/**
 * Runs a pipx command with safe-chain's certificate bundle and proxy configuration.
 * 
 * @param {string} command - The command to execute
 * @param {string[]} args - Command line arguments
 * @returns {Promise<{status: number}>} Exit status of the command
 */
export async function runPipX(command, args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);

    const combinedCaPath = getCombinedCaBundlePath();
    const modifiedEnv = getPipXCaBundleEnvironmentVariables(env, combinedCaPath);

    // Note: pipx uses HTTPS_PROXY and HTTP_PROXY environment variables for proxy configuration
    // These are already set by mergeSafeChainProxyEnvironmentVariables

    const result = await safeSpawn(command, args, {
      stdio: "inherit",
      env: modifiedEnv,
    });

    return { status: result.status };
  } catch (/** @type any */ error) {
    if (error.status) {
      return { status: error.status };
    } else {
      ui.writeError(`Error executing command: ${error.message}`);
      ui.writeError(`Is '${command}' installed and available on your system?`);
      return { status: 1 };
    }
  }
}
