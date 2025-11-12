import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { getCombinedCaBundlePath } from "../../registryProxy/certBundle.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * @param {string} command
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runPip(command, args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);

    // Always provide Python with a complete CA bundle (Safe Chain CA + Mozilla + Node built-in roots)
    // so that any network request made by pip, including those outside explicit CLI args,
    // validates correctly under both MITM'd and tunneled HTTPS.
    const combinedCaPath = getCombinedCaBundlePath();

    if (!env.REQUESTS_CA_BUNDLE) {
      env.REQUESTS_CA_BUNDLE = combinedCaPath;
    }
    
    if (!env.SSL_CERT_FILE) {
      env.SSL_CERT_FILE = combinedCaPath;
    }

    // To counter behavior that is sometimes seen where pip ignores REQUESTS_CA_BUNDLE/SSL_CERT_FILE,
    // We will set additional env vars for pip
    if (!env.PIP_CERT) {
      env.PIP_CERT = combinedCaPath;
    }

    // PIP_CONFIG file is created to ensure proxy and cert settings are applied even if env vars are ignored for certificates (e.g. Python 3.11 and up).
    if (!env.PIP_CONFIG_FILE) {
      const tmpDir = os.tmpdir();
      const pipConfigPath = path.join(tmpDir, `safe-chain-pip-${Date.now()}.ini`);

      // Proxy settings: prefer GLOBAL_AGENT_HTTP_PROXY, then HTTPS_PROXY, then HTTP_PROXY
      const proxy = env.GLOBAL_AGENT_HTTP_PROXY || env.HTTPS_PROXY || env.HTTP_PROXY || '';

      // Build pip config INI
      let pipConfig = '[global]\n';
      pipConfig += `cert = ${combinedCaPath}\n`;
      if (proxy) pipConfig += `proxy = ${proxy}\n`;

      await fs.writeFile(pipConfigPath, pipConfig);
      env.PIP_CONFIG_FILE = pipConfigPath;
    }

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
