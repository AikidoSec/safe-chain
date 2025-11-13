import * as cliArguments from "./cliArguments.js";

export const LOGGING_SILENT = "silent";
export const LOGGING_NORMAL = "normal";
export const LOGGING_VERBOSE = "verbose";

export function getLoggingLevel() {
  const level = cliArguments.getLoggingLevel();

  if (level === LOGGING_SILENT) {
    return LOGGING_SILENT;
  }

  if (level === LOGGING_VERBOSE) {
    return LOGGING_VERBOSE;
  }

  return LOGGING_NORMAL;
}

export const ECOSYSTEM_JS = "js";
export const ECOSYSTEM_PY = "py";

// Default to JavaScript ecosystem
const ecosystemSettings = {
  ecoSystem: ECOSYSTEM_JS,
};

/** @returns {string} - The current ecosystem setting (ECOSYSTEM_JS or ECOSYSTEM_PY) */
export function getEcoSystem() {
  return ecosystemSettings.ecoSystem;
}
/**
 * @param {string} setting - The ecosystem to set (ECOSYSTEM_JS or ECOSYSTEM_PY)
 */
export function setEcoSystem(setting) {
  ecosystemSettings.ecoSystem = setting;
}

const defaultMinimumPackageAge = 24;
export function getMinimumPackageAgeHours() {
  return defaultMinimumPackageAge;
}

const defaultSkipMinimumPackageAge = false;
export function skipMinimumPackageAge() {
  const cliValue = cliArguments.getSkipMinimumPackageAge();

  if (cliValue === true) {
    return true;
  }

  return defaultSkipMinimumPackageAge;
}
