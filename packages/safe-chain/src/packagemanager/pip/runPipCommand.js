import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { getCombinedCaBundlePath } from "../../registryProxy/certBundle.js";
import { knownPipRegistries } from "../../registryProxy/parsePackageFromUrl.js";
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
    env.REQUESTS_CA_BUNDLE = combinedCaPath;
    env.SSL_CERT_FILE = combinedCaPath;

    // To counter behavior that is sometimes seen where pip ignores REQUESTS_CA_BUNDLE/SSL_CERT_FILE,
    // We will set additional env vars for pip
    env.PIP_CERT = combinedCaPath;

    // Create a temporary pip config file
    const tmpDir = os.tmpdir();
    const pipConfigPath = path.join(tmpDir, `safe-chain-pip-${Date.now()}.ini`);

    // Proxy settings
    const httpProxy = env.HTTP_PROXY || '';
    const httpsProxy = env.HTTPS_PROXY || '';

    // Build pip config INI
    let pipConfig = '[global]\n';
    pipConfig += `cert = ${combinedCaPath}\n`;
    if (httpProxy) pipConfig += `proxy = ${httpProxy}\n`;
    if (httpsProxy) pipConfig += `proxy = ${httpsProxy}\n`;

    await fs.writeFile(pipConfigPath, pipConfig);
    env.PIP_CONFIG_FILE = pipConfigPath;

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
