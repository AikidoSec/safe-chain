import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { getCombinedCaBundlePath } from "../../registryProxy/certBundle.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";

/**
 * @returns {import("../currentPackageManager.js").PackageManager}
 */
export function createPdmPackageManager() {
  return {
    runCommand: (args) => runPdmCommand(args),

    // MITM only approach for PDM
    isSupportedCommand: () => false,
    getDependencyUpdatesForCommand: () => [],
  };
}

/**
 * Sets CA bundle environment variables used by PDM and Python libraries.
 * PDM uses httpx (via unearth) which respects SSL_CERT_FILE through Python's ssl module.
 *
 * @param {NodeJS.ProcessEnv} env - Environment object to modify
 * @param {string} combinedCaPath - Path to the combined CA bundle
 */
function setPdmCaBundleEnvironmentVariables(env, combinedCaPath) {
  // SSL_CERT_FILE: Used by Python SSL libraries and httpx (which PDM uses)
  if (env.SSL_CERT_FILE) {
    ui.writeWarning("Safe-chain: User defined SSL_CERT_FILE found in environment. It will be overwritten.");
  }
  env.SSL_CERT_FILE = combinedCaPath;

  // REQUESTS_CA_BUNDLE: Used by the requests library (PDM plugins may use it)
  if (env.REQUESTS_CA_BUNDLE) {
    ui.writeWarning("Safe-chain: User defined REQUESTS_CA_BUNDLE found in environment. It will be overwritten.");
  }
  env.REQUESTS_CA_BUNDLE = combinedCaPath;

  // PIP_CERT: PDM may use pip internally
  if (env.PIP_CERT) {
    ui.writeWarning("Safe-chain: User defined PIP_CERT found in environment. It will be overwritten.");
  }
  env.PIP_CERT = combinedCaPath;
}

/**
 * Runs a pdm command with safe-chain's certificate bundle and proxy configuration.
 *
 * PDM respects standard HTTP_PROXY/HTTPS_PROXY environment variables through
 * httpx which it uses for package downloads.
 *
 * @param {string[]} args - Command line arguments to pass to pdm
 * @returns {Promise<{status: number}>} Exit status of the pdm command
 */
async function runPdmCommand(args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);

    const combinedCaPath = getCombinedCaBundlePath();
    setPdmCaBundleEnvironmentVariables(env, combinedCaPath);

    const result = await safeSpawn("pdm", args, {
      stdio: "inherit",
      env,
    });

    return { status: result.status };
  } catch (/** @type any */ error) {
    return reportCommandExecutionFailure(error, "pdm");
  }
}
