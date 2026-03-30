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

  const pythonSeparatorPattern = /[._-]/g;
  const hyphenName = packageName.replaceAll(pythonSeparatorPattern, "-");
  const underscoreName = packageName.replaceAll(pythonSeparatorPattern, "_");
  const dotName = packageName.replaceAll(pythonSeparatorPattern, ".");

  return [...new Set([packageName, hyphenName, underscoreName, dotName])];
}
