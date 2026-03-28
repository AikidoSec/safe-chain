import {
  getMinimumPackageAgeHours,
  getEcoSystem,
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
} from "../config/settings.js";
import { getEquivalentPackageNames } from "./packageNameVariants.js";

/**
 * @typedef {Object} NewPackagesDatabase
 * @property {function(string | undefined, string | undefined): boolean} isNewlyReleasedPackage
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
  const ecosystem = getEcoSystem();

  /**
   * @param {string | undefined} name
   * @param {string | undefined} version
   * @returns {boolean}
   */
  function isNewlyReleasedPackage(name, version) {
    if (!name || !version) {
      return false;
    }

    const cutOff = new Date(
      new Date().getTime() - getMinimumPackageAgeHours() * 3600 * 1000
    );
    const expectedSource = getCurrentFeedSource();
    const candidateNames = getEquivalentPackageNames(name, ecosystem);

    const entry = newPackagesList.find(
      (pkg) =>
        (!pkg.source || pkg.source.toLowerCase() === expectedSource) &&
        candidateNames.includes(pkg.package_name) &&
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
