import { ECOSYSTEM_PY } from "../config/settings.js";

/**
 * @param {string} packageName
 * @param {string} ecosystem
 * @returns {string[]}
 */
export function getEquivalentPackageNames(packageName, ecosystem) {
  if (ecosystem !== ECOSYSTEM_PY) {
    return [packageName];
  }

  return [...new Set([packageName, ...["-", "_", "."].map((separator) =>
    packageName.replaceAll(/[._-]/g, separator)
  )])];
}
