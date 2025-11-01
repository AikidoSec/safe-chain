import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";

/**
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runYarnCommand(args) {
  try {
    // @ts-expect-error values of process.env can be string | undefined
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);
    await fixYarnProxyEnvironmentVariables(env);

    const result = await safeSpawn("yarn", args, {
      stdio: "inherit",
      env,
    });
    return { status: result.status };
  } catch (/** @type any */ error) {
    if (error.status) {
      return { status: error.status };
    } else {
      ui.writeError("Error executing command:", error.message);
      return { status: 1 };
    }
  }
}

/**
 * @param {Record<string, string>} env
 *
 * @returns {Promise<void>}
 */
async function fixYarnProxyEnvironmentVariables(env) {
  // Yarn ignores standard proxy environment variable HTTPS_PROXY
  // It does respect NODE_EXTRA_CA_CERTS for custom CA certificates though.
  // Don't use YARN_HTTPS_CA_FILE_PATH though, as it causes to ignore all system CAs

  // Yarn v2/v3 and v4+ use different environment variables for proxy and CA certs
  // When setting all variables, yarn returns an error about conflicting variables
  //  - v2/v3: "Usage Error: Unrecognized or legacy configuration settings found: httpsCaFilePath"
  //  - v4+:   "Usage Error: Unrecognized or legacy configuration settings found: caFilePath"

  const version = await yarnVersion();
  const majorVersion = parseInt(version.split(".")[0]);

  if (majorVersion >= 4) {
    env.YARN_HTTPS_PROXY = env.HTTPS_PROXY;
  } else if (majorVersion === 2 || majorVersion === 3) {
    env.YARN_HTTPS_PROXY = env.HTTPS_PROXY;
  }
}

async function yarnVersion() {
  const result = await safeSpawn("yarn", ["--version"], {
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error("Failed to get yarn version");
  }
  return result.stdout.trim();
}
