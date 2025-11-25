import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { getCombinedCaBundlePath } from "../../registryProxy/certBundle.js";

/**
 * Sets CA bundle environment variables used by Python libraries and uv.
 * 
 * @param {NodeJS.ProcessEnv} env - Env object
 * @param {string} combinedCaPath - Path to the combined CA bundle
 */
function setUvCaBundleEnvironmentVariables(env, combinedCaPath) {
  // SSL_CERT_FILE: Used by Python SSL libraries and underlying HTTP clients
  if (env.SSL_CERT_FILE) {
    ui.writeWarning("Safe-chain: User defined SSL_CERT_FILE found in environment. It will be overwritten.");
  }
  env.SSL_CERT_FILE = combinedCaPath;

  // REQUESTS_CA_BUNDLE: Used by the requests library (which uv may use internally)
  if (env.REQUESTS_CA_BUNDLE) {
    ui.writeWarning("Safe-chain: User defined REQUESTS_CA_BUNDLE found in environment. It will be overwritten.");
  }
  env.REQUESTS_CA_BUNDLE = combinedCaPath;

  // PIP_CERT: Some underlying pip operations may respect this
  if (env.PIP_CERT) {
    ui.writeWarning("Safe-chain: User defined PIP_CERT found in environment. It will be overwritten.");
  }
  env.PIP_CERT = combinedCaPath;
}

/**
 * Runs a uv command with safe-chain's certificate bundle and proxy configuration.
 * 
 * uv respects standard environment variables for proxy and TLS configuration:
 * - HTTP_PROXY / HTTPS_PROXY: Proxy settings
 * - SSL_CERT_FILE / REQUESTS_CA_BUNDLE: CA bundle for TLS verification
 * 
 * Unlike pip (which requires a temporary config file for cert configuration), uv directly
 * honors environment variables, so no config/ini file is needed.
 * 
 * @param {string} command - The uv command to execute (typically 'uv')
 * @param {string[]} args - Command line arguments to pass to uv
 * @returns {Promise<{status: number}>} Exit status of the uv command
 */
export async function runUv(command, args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);

    const combinedCaPath = getCombinedCaBundlePath();
    setUvCaBundleEnvironmentVariables(env, combinedCaPath);

    // Note: uv uses HTTPS_PROXY and HTTP_PROXY environment variables for proxy configuration
    // These are already set by mergeSafeChainProxyEnvironmentVariables

    const result = await safeSpawn(command, args, {
      stdio: "inherit",
      env,
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
