import * as cliArguments from "./cliArguments.js";
import * as configFile from "./configFile.js";
import * as environmentVariables from "./environmentVariables.js";

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
export const ECOSYSTEM_ALL = "all";

// Default to JavaScript ecosystem
const ecosystemSettings = {
  ecoSystem: ECOSYSTEM_JS,
};

/** @returns {string} - The current ecosystem setting (ECOSYSTEM_JS, ECOSYSTEM_PY, or ECOSYSTEM_ALL) */
export function getEcoSystem() {
  return ecosystemSettings.ecoSystem;
}
/**
 * @param {string} setting - The ecosystem to set (ECOSYSTEM_JS, ECOSYSTEM_PY, or ECOSYSTEM_ALL)
 */
export function setEcoSystem(setting) {
  if (![ECOSYSTEM_JS, ECOSYSTEM_PY, ECOSYSTEM_ALL].includes(setting)) {
    throw new Error(`Invalid ecosystem: ${setting}. Must be one of: ${ECOSYSTEM_JS}, ${ECOSYSTEM_PY}, ${ECOSYSTEM_ALL}`);
  }
  ecosystemSettings.ecoSystem = setting;
}

const defaultMinimumPackageAge = 24;
/** @returns {number} */
export function getMinimumPackageAgeHours() {
  // Priority 1: CLI argument
  const cliValue = validateMinimumPackageAgeHours(
    cliArguments.getMinimumPackageAgeHours()
  );
  if (cliValue !== undefined) {
    return cliValue;
  }

  // Priority 2: Environment variable
  const envValue = validateMinimumPackageAgeHours(
    environmentVariables.getMinimumPackageAgeHours()
  );
  if (envValue !== undefined) {
    return envValue;
  }

  // Priority 3: Config file
  const configValue = configFile.getMinimumPackageAgeHours();
  if (configValue !== undefined) {
    return configValue;
  }

  return defaultMinimumPackageAge;
}

/**
 * @param {string | undefined} value
 * @returns {number | undefined}
 */
function validateMinimumPackageAgeHours(value) {
  if (!value) {
    return undefined;
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return undefined;
  }

  if (numericValue > 0) {
    return numericValue;
  }

  return undefined;
}

const defaultSkipMinimumPackageAge = false;
export function skipMinimumPackageAge() {
  const cliValue = cliArguments.getSkipMinimumPackageAge();

  if (cliValue === true) {
    return true;
  }

  return defaultSkipMinimumPackageAge;
}
