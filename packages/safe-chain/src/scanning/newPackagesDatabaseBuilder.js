import {
  getMinimumPackageAgeHours,
  getEcoSystem,
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
} from "../config/settings.js";

/**
 * @typedef {Object} NewPackagesDatabase
 * @property {function(string, string): boolean} isNewlyReleasedPackage
 */

/**
 * Returns the ecosystem identifier expected in upstream/core release feeds.
 * @returns {string}
 */
function getCurrentFeedSource() {
  const ecosystem = getEcoSystem();

  if (ecosystem === ECOSYSTEM_JS) {
    return "npm";
  }

  if (ecosystem === ECOSYSTEM_PY) {
    return "pypi";
  }

  return ecosystem;
}

/**
 * @param {import("../api/aikido.js").NewPackageEntry[]} newPackagesList
 * @returns {NewPackagesDatabase}
 */
export function buildNewPackagesDatabase(newPackagesList) {
  /**
   * @param {string} name
   * @param {string} version
   * @returns {boolean}
   */
  function isNewlyReleasedPackage(name, version) {
    const cutOff = new Date(
      new Date().getTime() - getMinimumPackageAgeHours() * 3600 * 1000
    );
    const expectedSource = getCurrentFeedSource();

    const entry = newPackagesList.find(
      (pkg) =>
        (!pkg.source || pkg.source.toLowerCase() === expectedSource) &&
        pkg.package_name === name &&
        pkg.version === version
    );

    if (!entry) {
      return false;
    }

    const releasedOn = new Date(entry.released_on * 1000);
    return releasedOn > cutOff;
  }

  return { isNewlyReleasedPackage };
}
