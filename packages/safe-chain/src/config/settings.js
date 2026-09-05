import os from "os";
import path from "path";
import * as cliArguments from "./cliArguments.js";
import * as configFile from "./configFile.js";
import * as environmentVariables from "./environmentVariables.js";
import * as pnpmWorkspaceConfig from "./pnpmWorkspaceConfig.js";
import { getPackageManagerName } from "./packageManagerName.js";
import { ui } from "../environment/userInteraction.js";

export const LOGGING_SILENT = "silent";
export const LOGGING_NORMAL = "normal";
export const LOGGING_VERBOSE = "verbose";

export function getLoggingLevel() {
  // Priority 1: CLI argument
  const cliLevel = cliArguments.getLoggingLevel();
  if (isValidVerbosity(cliLevel)) {
    return cliLevel;
  }
  if (cliLevel) {
    // CLI arg was set but invalid, default to normal for backwards compatibility.
    return LOGGING_NORMAL;
  }

  // Priority 2: Environment variable
  const envLevel = environmentVariables.getLoggingLevel()?.toLowerCase();
  if (isValidVerbosity(envLevel)) {
    return envLevel;
  }

  return LOGGING_NORMAL;
}

/**
 * Gets the log file path with priority: CLI argument > environment variable > config file > undefined
 * @returns {string | undefined}
 */
export function getLogFile() {
  // Priority 1: CLI argument
  const cliValue = cliArguments.getLogFile();
  if (cliValue) {
    return expandTilde(cliValue);
  }

  // Priority 2: Environment variable
  const envValue = environmentVariables.getLogFile();
  if (envValue) {
    return expandTilde(envValue);
  }

  // Priority 3: Config file
  const configValue = configFile.getLogFile();
  if (configValue) {
    return expandTilde(configValue);
  }

  return undefined;
}

/**
 * Expands a leading "~/" or bare "~" to the user's home directory. Shells
 * don't expand tilde after "=" (e.g. --safe-chain-log-file=~/foo.log) and
 * env vars are never shell-expanded, so we do it here.
 *
 * @param {string} filePath
 * @returns {string}
 */
function expandTilde(filePath) {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

export const LOG_FILE_FORMAT_PLAIN = "plain";
export const LOG_FILE_FORMAT_JSON = "json";

/**
 * Gets the log file format with priority: CLI argument > environment variable > config file > "json"
 * @returns {string}
 */
export function getLogFileFormat() {
  // Priority 1: CLI argument
  const cliValue = cliArguments.getLogFileFormat();
  if (cliValue === LOG_FILE_FORMAT_PLAIN || cliValue === LOG_FILE_FORMAT_JSON) {
    return cliValue;
  }
  if (cliValue) {
    // CLI arg was set but invalid, default to json. Mirrors getLoggingLevel.
    return LOG_FILE_FORMAT_JSON;
  }

  // Priority 2: Environment variable
  const envValue = environmentVariables.getLogFileFormat()?.toLowerCase();
  if (envValue === LOG_FILE_FORMAT_PLAIN || envValue === LOG_FILE_FORMAT_JSON) {
    return envValue;
  }

  // Priority 3: Config file
  const configValue = configFile.getLogFileFormat()?.toLowerCase();
  if (configValue === LOG_FILE_FORMAT_PLAIN || configValue === LOG_FILE_FORMAT_JSON) {
    return configValue;
  }

  return LOG_FILE_FORMAT_JSON;
}

/**
 * Gets the log file verbosity with priority: CLI argument > environment
 * variable > config file > LOGGING_VERBOSE. Default is verbose because the
 * file is meant to be the diagnostic record; users opt down explicitly.
 * Reuses the LOGGING_* enum since the levels mean the same thing as for
 * console output.
 *
 * @returns {string}
 */
export function getLogFileVerbosity() {
  // Priority 1: CLI argument
  const cliValue = cliArguments.getLogFileVerbosity();
  if (isValidVerbosity(cliValue)) {
    return cliValue;
  }
  if (cliValue) {
    // CLI arg was set but invalid, default to verbose. Mirrors getLoggingLevel.
    return LOGGING_VERBOSE;
  }

  // Priority 2: Environment variable
  const envValue = environmentVariables.getLogFileVerbosity()?.toLowerCase();
  if (isValidVerbosity(envValue)) {
    return envValue;
  }

  // Priority 3: Config file
  const configValue = configFile.getLogFileVerbosity()?.toLowerCase();
  if (isValidVerbosity(configValue)) {
    return configValue;
  }

  return LOGGING_VERBOSE;
}

/**
 * @param {string | undefined} value
 * @returns {value is "silent" | "normal" | "verbose"}
 */
function isValidVerbosity(value) {
  return (
    value === LOGGING_SILENT ||
    value === LOGGING_NORMAL ||
    value === LOGGING_VERBOSE
  );
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

const defaultMinimumPackageAge = 48;
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

  // Priority 4: pnpm-workspace.yaml / package.json#pnpm (only under the pnpm shim)
  if (isPnpmShim()) {
    const pnpmValue = pnpmWorkspaceConfig.getMinimumReleaseAgeHours();
    if (pnpmValue !== undefined) {
      return pnpmValue;
    }
  }

  return defaultMinimumPackageAge;
}

function isPnpmShim() {
  const name = getPackageManagerName();
  return name === "pnpm" || name === "pnpx";
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

/**
 * Parses comma-separated exclusions from environment variable
 * @param {string | undefined} envValue
 * @returns {string[]}
 */
function parseExclusionsFromEnv(envValue) {
  if (!envValue || typeof envValue !== "string") {
    return [];
  }

  return envValue
    .split(",")
    .map((exclusion) => exclusion.trim())
    .filter((exclusion) => exclusion.length > 0);
}

/**
 * Gets the minimum package age exclusions from both environment variable and config file (merged)
 * @returns {string[]}
 */
export function getMinimumPackageAgeExclusions() {
  const envExclusions = parseExclusionsFromEnv(
    environmentVariables.getMinimumPackageAgeExclusions()
  );
  const configExclusions = configFile.getMinimumPackageAgeExclusions();
  const pnpmExclusions = isPnpmShim()
    ? pnpmWorkspaceConfig.getMinimumReleaseAgeExclusions()
    : [];

  // Merge all sources and remove duplicates
  const allExclusions = [...envExclusions, ...configExclusions, ...pnpmExclusions];
  return [...new Set(allExclusions)];
}

/**
 * Gets the malware list base URL with priority: CLI argument > environment variable > config file > default
 * @returns {string}
 */
export function getMalwareListBaseUrl() {
  // Priority 1: CLI argument
  const cliValue = cliArguments.getMalwareListBaseUrl();
  if (cliValue) {
    const url = removeTrailingSlashes(cliValue);
    ui.writeVerbose(`Fetching malware lists from ${url} as defined by CLI argument --safe-chain-malware-list-base-url`);
    return url;
  }

  // Priority 2: Environment variable
  const envValue = environmentVariables.getMalwareListBaseUrl();
  if (envValue) {
    const url = removeTrailingSlashes(envValue);
    ui.writeVerbose(`Fetching malware lists from ${url} as defined by environment variable SAFE_CHAIN_MALWARE_LIST_BASE_URL`);
    return url;
  }

  // Priority 3: Config file
  const configValue = configFile.getMalwareListBaseUrl();
  if (configValue) {
    const url = removeTrailingSlashes(configValue);
    ui.writeVerbose(`Fetching malware lists from ${url} as defined by config file (malwareListBaseUrl)`);
    return url;
  }

  // Default
  return removeTrailingSlashes("https://malware-list.aikido.dev");
}

/**
 * Removes trailing slashes from a URL-like string.
 * @param {string} value
 * @returns {string}
 */
function removeTrailingSlashes(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  return value.replace(/\/+$/, "");
}
