/**
 * Gets the minimum package age in hours from environment variable
 * @returns {string | undefined}
 */
export function getMinimumPackageAgeHours() {
  return process.env.SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS;
}

/**
 * Gets the custom npm registries from environment variable
 * Expected format: comma-separated list of registry domains
 * Example: "npm.company.com,registry.internal.net"
 * @returns {string | undefined}
 */
export function getNpmCustomRegistries() {
  return process.env.SAFE_CHAIN_NPM_CUSTOM_REGISTRIES;
}

/**
 * Gets the custom pip registries from environment variable
 * Expected format: comma-separated list of registry domains
 * Example: "pip.company.com,registry.internal.net"
 * @returns {string | undefined}
 */
export function getPipCustomRegistries() {
  return process.env.SAFE_CHAIN_PIP_CUSTOM_REGISTRIES;
}

/**
 * Gets the logging level from environment variable
 * Valid values: "silent", "normal", "verbose"
 * @returns {string | undefined}
 */
export function getLoggingLevel() {
  return process.env.SAFE_CHAIN_LOGGING;
}
