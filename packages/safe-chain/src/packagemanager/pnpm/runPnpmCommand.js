import { ui } from "../../environment/userInteraction.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { safeSpawn } from "../../utils/safeSpawn.js";

/**
 * @param {string[]} args
 * @param {string} [toolName]
 * @returns {Promise<{status: number}>}
 */
export async function runPnpmCommand(args, toolName = "pnpm") {
  try {
    let result;
    if (toolName === "pnpm") {
      result = await safeSpawn("pnpm", args, {
        stdio: "inherit",
        env: mergeSafeChainProxyEnvironmentVariables(process.env),
      });
    } else if (toolName === "pnpx") {
      result = await safeSpawn("pnpx", args, {
        stdio: "inherit",
        env: mergeSafeChainProxyEnvironmentVariables(process.env),
      });
    } else {
      throw new Error(`Unsupported tool name for aikido-pnpm: ${toolName}`);
    }

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
