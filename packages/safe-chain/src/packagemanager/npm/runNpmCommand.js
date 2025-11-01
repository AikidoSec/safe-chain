import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";

/**
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runNpm(args) {
  try {
    const result = await safeSpawn("npm", args, {
      stdio: "inherit",
      // @ts-expect-error values of process.env can be string | undefined
      env: mergeSafeChainProxyEnvironmentVariables(process.env),
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
 * @param {string[]} args
 * @returns {Promise<{status: number, output?: string}>}
 */
export async function dryRunNpmCommandAndOutput(args) {
  try {
    const result = await safeSpawn(
      "npm",
      [...args, "--ignore-scripts", "--dry-run"],
      {
        stdio: "pipe",
        // @ts-expect-error values of process.env can be string | undefined
        env: mergeSafeChainProxyEnvironmentVariables(process.env),
      }
    );
    return {
      status: result.status,
      output: result.status === 0 ? result.stdout : result.stderr,
    };
  } catch (/** @type any */ error) {
    if (error.status) {
      const output =
        error.stdout?.toString() ??
        error.stderr?.toString() ??
        error.message ??
        "";
      return { status: error.status, output };
    } else {
      ui.writeError("Error executing command:", error.message);
      return { status: 1 };
    }
  }
}
