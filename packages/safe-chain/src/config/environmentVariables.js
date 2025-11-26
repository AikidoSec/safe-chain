/**
 * Gets the minimum package age in hours from environment variable
 * @returns {string | undefined}
 */
export function getMinimumPackageAgeHours() {
  return process.env.SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS;
}
