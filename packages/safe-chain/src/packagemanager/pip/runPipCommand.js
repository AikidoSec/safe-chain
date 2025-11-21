import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { getCombinedCaBundlePath } from "../../registryProxy/certBundle.js";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import ini from "ini";

/**
 * Sets fallback CA bundle environment variables used by Python libraries.
 * These are applied in addition to the PIP_CONFIG_FILE to ensure all Python
 * network libraries respect the combined CA bundle, even if they don't read pip's config.
 * 
 * @param {NodeJS.ProcessEnv} env - Environment object to modify
 * @param {string} combinedCaPath - Path to the combined CA bundle
 */
function setFallbackCaBundleEnvironmentVariables(env, combinedCaPath) {
  // REQUESTS_CA_BUNDLE: Used by the popular 'requests' library
  if (env.REQUESTS_CA_BUNDLE) {
    ui.writeWarning("Safe-chain: User defined REQUESTS_CA_BUNDLE found in environment. It will be overwritten.");
  }
  env.REQUESTS_CA_BUNDLE = combinedCaPath;

  // SSL_CERT_FILE: Used by some Python SSL libraries and urllib
  if (env.SSL_CERT_FILE) {
    ui.writeWarning("Safe-chain: User defined SSL_CERT_FILE found in environment. It will be overwritten.");
  }
  env.SSL_CERT_FILE = combinedCaPath;

  // PIP_CERT: Pip's own environment variable for certificate verification
  if (env.PIP_CERT) {
    ui.writeWarning("Safe-chain: User defined PIP_CERT found in environment. It will be overwritten.");
  }
  env.PIP_CERT = combinedCaPath;
}

/**
 * Runs a pip command with safe-chain's certificate bundle and proxy configuration.
 * 
 * Creates a temporary pip config file to configure:
 * - Cert bundle for HTTPS verification
 * - Proxy settings
 * 
 * If the user has an existing PIP_CONFIG_FILE, a new temporary config is created that merges
 * their settings with safe-chain's, leaving the original file unchanged.
 * 
 * @param {string} command - The pip command to execute (e.g., 'pip3')
 * @param {string[]} args - Command line arguments to pass to pip
 * @returns {Promise<{status: number}>} Exit status of the pip command
 */
export async function runPip(command, args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);

    // Always provide Python with a complete CA bundle (Safe Chain CA + Mozilla + Node built-in roots)
    // so that any network request made by pip, including those outside explicit CLI args,
    // validates correctly under both MITM'd and tunneled HTTPS.
    const combinedCaPath = getCombinedCaBundlePath();

    // https://pip.pypa.io/en/stable/topics/https-certificates/ explains that the 'cert' param (which we're providing via INI file)
    // will tell pip to use the provided CA bundle for HTTPS verification.

    // Proxy settings: GLOBAL_AGENT_HTTP_PROXY is our safe-chain proxy (if active),
    // otherwise fall back to user-defined HTTPS_PROXY or HTTP_PROXY environment variables
    const proxy = env.GLOBAL_AGENT_HTTP_PROXY || env.HTTPS_PROXY || env.HTTP_PROXY || '';

    const tmpDir = os.tmpdir();
    const pipConfigPath = path.join(tmpDir, `safe-chain-pip-${Date.now()}.ini`);
    let cleanupConfigPath = null; // Track temp file for cleanup

    // Note: Setting PIP_CONFIG_FILE overrides all pip config levels (Global/User/Site) per pip's loading order
    if (!env.PIP_CONFIG_FILE) {
      /** @type {{ global: { cert: string, proxy?: string } }} */
      const configObj = { global: { cert: combinedCaPath } };
      if (proxy) {
        configObj.global.proxy = proxy;
      }
      const pipConfig = ini.stringify(configObj);
      await fs.writeFile(pipConfigPath, pipConfig);
      env.PIP_CONFIG_FILE = pipConfigPath;
      cleanupConfigPath = pipConfigPath;

    } else if (fsSync.existsSync(env.PIP_CONFIG_FILE)) {
      ui.writeVerbose("Safe-chain: Merging user provided PIP_CONFIG_FILE with safe-chain certificate and proxy settings.");
      const userConfig = env.PIP_CONFIG_FILE;

      // Read the existing config without modifying it
      let content = await fs.readFile(userConfig, "utf-8");
      const parsed = ini.parse(content);

      // Ensure [global] section exists
      parsed.global = parsed.global || {};

      // Cert
      if (typeof parsed.global.cert !== "undefined") {
        ui.writeWarning("Safe-chain: User defined cert found in PIP_CONFIG_FILE. It will be overwritten in the temporary config.");
      }
      parsed.global.cert = combinedCaPath;

      // Proxy
      if (typeof parsed.global.proxy !== "undefined") {
        ui.writeWarning("Safe-chain: User defined proxy found in PIP_CONFIG_FILE. It will be overwritten in the temporary config.");
      }
      if (proxy) {
        parsed.global.proxy = proxy;
      }
 
      const updated = ini.stringify(parsed);

      // Save to a new temp file to avoid overwriting user's original config
      await fs.writeFile(pipConfigPath, updated, "utf-8");
      env.PIP_CONFIG_FILE = pipConfigPath;
      cleanupConfigPath = pipConfigPath;

    } else {
      // The user provided PIP_CONFIG_FILE does not exist on disk
      // PIP will handle this as an error and inform the user
    }

    // Set fallback CA bundle environment variables for Python libraries that don't read pip config
    setFallbackCaBundleEnvironmentVariables(env, combinedCaPath);

    const result = await safeSpawn(command, args, {
      stdio: "inherit",
      env,
    });

    // Cleanup temporary config file if we created one
    if (cleanupConfigPath) {
      try {
        await fs.unlink(cleanupConfigPath);
      } catch {
        // Ignore cleanup errors - the file may have already been deleted or is inaccessible
        // Temp files in os.tmpdir() may eventually be cleaned by the OS, but timing varies by platform
      }
    }

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
