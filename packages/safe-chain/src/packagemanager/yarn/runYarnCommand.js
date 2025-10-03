import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";

export async function runYarnCommand(args) {
  try {
    const env = mergeSafeChainProxyEnvironmentVariables(process.env);
    await fixYarnProxyEnvironmentVariables(env);

    const result = await safeSpawn("yarn", args, {
      stdio: "inherit",
      env,
    });
    return { status: result.status };
  } catch (error) {
    if (error.status) {
      return { status: error.status };
    } else {
      ui.writeError("Error executing command:", error.message);
      return { status: 1 };
    }
  }
}

async function fixYarnProxyEnvironmentVariables(env) {
  // Yarn ignores standard proxy environment variables HTTPS_PROXY and NODE_EXTRA_CA_CERTS

  // Yarn v2/v3 and v4+ use different environment variables for proxy and CA certs
  // When setting all variables, yarn returns an error about conflicting variables
  //  - v2/v3: "Usage Error: Unrecognized or legacy configuration settings found: httpsCaFilePath"
  //  - v4+:   "Usage Error: Unrecognized or legacy configuration settings found: caFilePath"

  const version = await yarnVersion();
  const majorVersion = parseInt(version.split(".")[0]);

  if (majorVersion >= 4) {
    env.YARN_HTTPS_PROXY = env.HTTPS_PROXY;
    env.YARN_HTTPS_CA_FILE_PATH = env.NODE_EXTRA_CA_CERTS;
  } else if (majorVersion === 2 || majorVersion === 3) {
    env.YARN_HTTPS_PROXY = env.HTTPS_PROXY;
    env.YARN_CA_FILE_PATH = env.NODE_EXTRA_CA_CERTS;
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
