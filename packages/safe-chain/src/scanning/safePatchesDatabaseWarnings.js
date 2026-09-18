import { ui } from "../environment/userInteraction.js";

let hasWarnedAboutUnavailableSafePatchesDatabase = false;

/** @param {Error} error */
export function warnOnceAboutUnavailableSafePatchesDatabase(error) {
  if (!hasWarnedAboutUnavailableSafePatchesDatabase) {
    ui.writeWarning(
      `Failed to load the safe patches list. Continuing without safe patch exemptions from the minimum package age check. ${error.message}`
    );
    hasWarnedAboutUnavailableSafePatchesDatabase = true;
  }
}

export function resetWarningState() {
  hasWarnedAboutUnavailableSafePatchesDatabase = false;
}
