import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { installSafeChainCA } from "../../registryProxy/certUtils.js";

function shouldMockCAInstall() {
  return process.env.SAFE_CHAIN_TEST_SKIP_CA_INSTALL === "1";
}

/**
 * @param {string} command
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runPip(command, args) {
  try {
    // Install Safe Chain CA in OS trust store before running pip, unless in test mode
    if (!shouldMockCAInstall()) {
      await installSafeChainCA();
    }
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);
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
