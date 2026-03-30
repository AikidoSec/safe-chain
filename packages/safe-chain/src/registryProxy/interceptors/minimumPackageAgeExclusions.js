import { getMinimumPackageAgeExclusions, getEcoSystem } from "../../config/settings.js";
import { getEquivalentPackageNames } from "../../scanning/packageNameVariants.js";

/**
 * Checks if a package name matches an exclusion pattern.
 * Supports trailing wildcard (*) for prefix matching.
 * @param {string} packageName
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchesExclusionPattern(packageName, pattern) {
  if (pattern.endsWith("/*")) {
    return packageName.startsWith(pattern.slice(0, -1));
  }
  return packageName === pattern;
}

/**
 * @param {string | undefined} packageName
 * @returns {boolean}
 */
export function isExcludedFromMinimumPackageAge(packageName) {
  if (!packageName) {
    return false;
  }

  const exclusions = getMinimumPackageAgeExclusions();
  const candidateNames = getEquivalentPackageNames(packageName, getEcoSystem());

  return exclusions.some((pattern) =>
    candidateNames.some((name) => matchesExclusionPattern(name, pattern))
  );
}
