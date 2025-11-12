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

    // https://pip.pypa.io/en/stable/topics/https-certificates/ explains that the --cert option (which we're providing via both INI and PIP_CERT)
    // Testing has shown that REQUESTS_CA_BUNDLE alone is not sufficient; PIP_CERT, SSL_CERT_FILE, or pip config cert is also needed in some cases.
    
    if (!env.SSL_CERT_FILE) {
      env.SSL_CERT_FILE = combinedCaPath;
    }

    if (!env.PIP_CERT) {
      env.PIP_CERT = combinedCaPath;
    }

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
