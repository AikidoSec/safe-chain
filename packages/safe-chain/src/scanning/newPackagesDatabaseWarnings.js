import { ui } from "../environment/userInteraction.js";

let hasWarnedAboutUnavailableNewPackagesDatabase = false;

/** @param {Error} error */
export function warnOnceAboutUnavailableDatabase(error) {
  if (!hasWarnedAboutUnavailableNewPackagesDatabase) {
    ui.writeWarning(
      `Failed to load the new packages list used for direct package download request blocking. Continuing with metadata-based minimum age checks only. ${error.message}`
    );
    hasWarnedAboutUnavailableNewPackagesDatabase = true;
  }
}

export function resetWarningState() {
  hasWarnedAboutUnavailableNewPackagesDatabase = false;
}
