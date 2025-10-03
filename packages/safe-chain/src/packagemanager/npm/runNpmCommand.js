import { ui } from "../../environment/userInteraction.js";
import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";

export async function runNpm(args) {
  try {
    const result = await safeSpawn("npm", args, {
      stdio: "inherit",
      env: mergeSafeChainProxyEnvironmentVariables(process.env),
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

export async function dryRunNpmCommandAndOutput(args) {
  try {
    const result = await safeSpawn(
      "npm",
      [...args, "--ignore-scripts", "--dry-run"],
      {
        stdio: "pipe",
        env: mergeSafeChainProxyEnvironmentVariables(process.env),
      }
    );
    return {
      status: result.status,
      output: result.status === 0 ? result.stdout : result.stderr,
    };
  } catch (error) {
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
