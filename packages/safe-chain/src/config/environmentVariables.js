/**
 * Gets the minimum package age in hours from environment variable
 * @returns {string | undefined}
 */
export function getMinimumPackageAgeHours() {
  return process.env.SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS;
}

/**
 * Gets the custom pip registries from environment variable
 * @returns {string | undefined}
 */
export function getPipCustomRegistries() {
  return process.env.SAFE_CHAIN_PIP_CUSTOM_REGISTRIES;
}
