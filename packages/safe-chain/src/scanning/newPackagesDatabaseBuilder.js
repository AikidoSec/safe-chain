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
  const expectedSource = getCurrentFeedSource();

  /** @type {Map<string, import("../api/aikido.js").NewPackageEntry>} */
  const entriesByNameAndVersion = new Map();
  for (const pkg of newPackagesList) {
    if (pkg.source && pkg.source.toLowerCase() !== expectedSource) {
      continue;
    }
    const key = `${pkg.package_name} ${pkg.version}`;
    if (!entriesByNameAndVersion.has(key)) {
      entriesByNameAndVersion.set(key, pkg);
    }
  }

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

    for (const candidateName of getEquivalentPackageNames(name, ecosystem)) {
      const entry = entriesByNameAndVersion.get(`${candidateName} ${version}`);
      if (entry) {
        return new Date(entry.released_on * 1000) > cutOff;
      }
    }

    return false;
  }

  return { isNewlyReleasedPackage };
}
