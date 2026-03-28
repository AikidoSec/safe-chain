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

  const hyphenName = packageName.replaceAll(/[_.-]/g, "-");
  const underscoreName = packageName.replaceAll(/[._-]/g, "_");
  const dotName = packageName.replaceAll(/[_.-]/g, ".");

  return [...new Set([packageName, hyphenName, underscoreName, dotName])];
}
