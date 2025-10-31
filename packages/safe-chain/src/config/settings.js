import * as cliArguments from "./cliArguments.js";

export function getLoggingLevel() {
  const level = cliArguments.getLoggingLevel();

  if (level === LOGGING_SILENT) {
    return LOGGING_SILENT;
  }

  return LOGGING_NORMAL;
}

export const MALWARE_ACTION_BLOCK = "block";
export const MALWARE_ACTION_PROMPT = "prompt";

export const ECOSYSTEM_JS = "js";
export const ECOSYSTEM_PY = "py";

// Default to JavaScript ecosystem
const ecosystemSettings = {
  ecoSystem: ECOSYSTEM_JS,
};

export function getEcoSystem() {
  return ecosystemSettings.ecoSystem;
}
export function setEcoSystem(setting) {
  ecosystemSettings.ecoSystem = setting;
}

export const LOGGING_SILENT = "silent";
export const LOGGING_NORMAL = "normal";
