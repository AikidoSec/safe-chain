import * as cliArguments from "./cliArguments.js";
import * as configFile from "./configFile.js";
import * as environmentVariables from "./environmentVariables.js";

export const LOGGING_SILENT = "silent";
export const LOGGING_NORMAL = "normal";
export const LOGGING_VERBOSE = "verbose";

export function getLoggingLevel() {
  // Priority 1: CLI argument
  const cliLevel = cliArguments.getLoggingLevel();
  if (cliLevel === LOGGING_SILENT || cliLevel === LOGGING_VERBOSE) {
    return cliLevel;
  }
  if (cliLevel) {
    // CLI arg was set but invalid, default to normal
    return LOGGING_NORMAL;
  }

  // Priority 2: Environment variable
  const envLevel = environmentVariables.getLoggingLevel()?.toLowerCase();
  if (envLevel === LOGGING_SILENT || envLevel === LOGGING_VERBOSE) {
    return envLevel;
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

  if (numericValue >= 0) {
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

/**
 * Normalizes a registry URL by removing protocol if present
 * @param {string} registry
 * @returns {string}
 */
function normalizeRegistry(registry) {
  // Remove protocol (http://, https://) if present
  return registry.replace(/^https?:\/\//, "");
}

/**
 * Parses comma-separated registries from environment variable
 * @param {string | undefined} envValue
 * @returns {string[]}
 */
function parseRegistriesFromEnv(envValue) {
  if (!envValue || typeof envValue !== "string") {
    return [];
  }

  // Split by comma and trim whitespace
  return envValue
    .split(",")
    .map((registry) => registry.trim())
    .filter((registry) => registry.length > 0);
}

/**
 * Gets the custom npm registries from both environment variable and config file (merged)
 * @returns {string[]}
 */
export function getNpmCustomRegistries() {
  const envRegistries = parseRegistriesFromEnv(
    environmentVariables.getNpmCustomRegistries()
  );
  const configRegistries = configFile.getNpmCustomRegistries();

  // Merge both sources and remove duplicates
  const allRegistries = [...envRegistries, ...configRegistries];
  const uniqueRegistries = [...new Set(allRegistries)];

  // Normalize each registry (remove protocol if any)
  return uniqueRegistries.map(normalizeRegistry);
}

/**
 * Gets the custom npm registries from both environment variable and config file (merged)
 * @returns {string[]}
 */
export function getPipCustomRegistries() {
  const envRegistries = parseRegistriesFromEnv(
    environmentVariables.getPipCustomRegistries()
  );
  const configRegistries = configFile.getPipCustomRegistries();

  // Merge both sources and remove duplicates
  const allRegistries = [...envRegistries, ...configRegistries];
  const uniqueRegistries = [...new Set(allRegistries)];

  // Normalize each registry (remove protocol if any)
  return uniqueRegistries.map(normalizeRegistry);
}
