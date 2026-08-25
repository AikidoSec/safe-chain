import {
  getMinimumPackageAgeHours,
  getEcoSystem,
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
} from "../config/settings.js";
import { normalizePipPackageName } from "./packageNameVariants.js";

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

  /**
   * Python only. The PyPI feed carries display names (`ImkGreet`,
   * `Flask-First`), but pip only ever requests the PEP 503 normalised form
   * (`imkgreet`, `flask-first`), so both sides are folded to the same key.
   * This also subsumes the `-`/`_`/`.` separator variants PEP 503 collapses.
   *
   * npm names are case-sensitive and are used verbatim, leaving the JS
   * ecosystem's behaviour unchanged.
   *
   * @param {string} name
   * @returns {string}
   */
  function toLookupKey(name) {
    return ecosystem === ECOSYSTEM_PY ? normalizePipPackageName(name) : name;
  }

  /** @type {Map<string, import("../api/aikido.js").NewPackageEntry>} */
  const entriesByNameAndVersion = new Map();
  for (const pkg of newPackagesList) {
    if (pkg.source && pkg.source.toLowerCase() !== expectedSource) {
      continue;
    }
    const key = `${toLookupKey(pkg.package_name)} ${pkg.version}`;
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

    const entry = entriesByNameAndVersion.get(`${toLookupKey(name)} ${version}`);
    if (entry) {
      return new Date(entry.released_on * 1000) > cutOff;
    }

    return false;
  }

  return { isNewlyReleasedPackage };
}
