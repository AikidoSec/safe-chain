import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { getCombinedCaBundlePath } from "../../registryProxy/certBundle.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPoetryPackageManager() {
  return {
    runCommand: (args) => runPoetryCommand(args),

    // MITM only approach for Poetry
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}

/**
 * Sets CA bundle environment variables used by Poetry and Python libraries.
 * Poetry uses the Python requests library which respects these environment variables.
 * 
 * @param {NodeJS.ProcessEnv} env - Environment object to modify
 * @param {string} combinedCaPath - Path to the combined CA bundle
 */
function setPoetryCaBundleEnvironmentVariables(env, combinedCaPath) {
  // SSL_CERT_FILE: Used by Python SSL libraries and requests
  if (env.SSL_CERT_FILE) {
    ui.writeWarning("Safe-chain: User defined SSL_CERT_FILE found in environment. It will be overwritten.");
  }
  env.SSL_CERT_FILE = combinedCaPath;

  // REQUESTS_CA_BUNDLE: Used by the requests library (which Poetry uses)
  if (env.REQUESTS_CA_BUNDLE) {
    ui.writeWarning("Safe-chain: User defined REQUESTS_CA_BUNDLE found in environment. It will be overwritten.");
  }
  env.REQUESTS_CA_BUNDLE = combinedCaPath;

  // PIP_CERT: Poetry may use pip internally
  if (env.PIP_CERT) {
    ui.writeWarning("Safe-chain: User defined PIP_CERT found in environment. It will be overwritten.");
  }
  env.PIP_CERT = combinedCaPath;
}

/**
 * Runs a poetry command with safe-chain's certificate bundle and proxy configuration.
 * 
 * Poetry respects standard HTTP_PROXY/HTTPS_PROXY environment variables through
 * the Python requests library.
 * 
 * @param {string[]} args - Command line arguments to pass to poetry
 * @returns {Promise<{status: number}>} Exit status of the poetry command
 */
async function runPoetryCommand(args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);

    const combinedCaPath = getCombinedCaBundlePath();
    setPoetryCaBundleEnvironmentVariables(env, combinedCaPath);

    const result = await safeSpawn("poetry", args, {
      stdio: "inherit",
      env,
    });
    
    return { status: result.status };
  } catch (/** @type any */ error) {
    if (error.status) {
      return { status: error.status };
    } else {
      ui.writeError("Error executing command:", error.message);
      ui.writeError("Is 'poetry' installed and available on your system?");
      return { status: 1 };
    }
  }
}
