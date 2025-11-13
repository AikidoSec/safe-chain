import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { installSafeChainCA } from "../../registryProxy/certUtils.js";

/**
 * Returns true if the pip command needs the Safe-chain CA installed.
 * @param {string[]} args
 * @returns {boolean}
 */
function needsCaInstalled(args) {
  const known = new Set(["install", "wheel", "download"]);
  let startIdx = 0;
  if (args[0] === "-m" && (args[1] === "pip" || args[1] === "pip3")) {
    startIdx = 2;
  }
  for (let i = startIdx; i < args.length; i++) {
    const token = args[i];
    if (!token) continue;
    if (token.startsWith("-")) continue; // skip flags
    if (known.has(token)) return true;
  }
  return false;
}

/**
 * @param {string} command
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runPip(command, args) {
  try {
    // Only install CA for commands that download or build packages.
    // This minimizes privilege prompts for read-only operations like 'list' or 'show'.
    if (needsCaInstalled(args)) {
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
