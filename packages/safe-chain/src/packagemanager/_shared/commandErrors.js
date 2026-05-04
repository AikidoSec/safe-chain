import { ui } from "../../environment/userInteraction.js";

/**
 * Centralized logging for package-manager command launch failures.
 *
 * @param {any} error - Error thrown by safeSpawn while preparing/running the command.
 * @param {string} command - Command name that failed to execute.
 * @returns {{status: number}}
 */
export function reportCommandExecutionFailure(error, command) {
  const message = typeof error?.message === "string" ? error.message : "Unknown error";
  ui.writeError(`Error executing command: ${message}`);

  ui.writeError(`Is '${command}' installed and available on your system?`);

  return { status: typeof error?.status === "number" ? error.status : 1 };
}
