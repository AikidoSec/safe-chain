import zsh from "./supported-shells/zsh.js";
import bash from "./supported-shells/bash.js";
import powershell from "./supported-shells/powershell.js";
import windowsPowershell from "./supported-shells/windowsPowershell.js";
import fish from "./supported-shells/fish.js";
import { ui } from "../environment/userInteraction.js";

/**
 * @typedef {Object} Shell
 * @property {string} name
 * @property {() => boolean} isInstalled
 * @property {(tools: import("./helpers.js").AikidoTool[]) => boolean|Promise<boolean>} setup
 * @property {(tools: import("./helpers.js").AikidoTool[]) => boolean} teardown
 */

/**
 * @returns {Shell[]}
 */
export function detectShells() {
  let possibleShells = [zsh, bash, powershell, windowsPowershell, fish];
  let availableShells = [];

  try {
    for (const shell of possibleShells) {
      if (shell.isInstalled()) {
        availableShells.push(shell);
      }
    }
  } catch (/** @type {any} */ error) {
    ui.writeError(
      `We were not able to detect which shells are installed on your system. Please check your shell configuration. Error: ${error.message}`,
    );
    return [];
  }

  return availableShells;
}
