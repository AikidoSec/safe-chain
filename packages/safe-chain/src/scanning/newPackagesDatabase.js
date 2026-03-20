import {
  fetchNewPackagesList,
  fetchNewPackagesListVersion,
} from "../api/aikido.js";
import {
  readNewPackagesListFromLocalCache,
  writeNewPackagesListToLocalCache,
} from "../config/configFile.js";
import { ui } from "../environment/userInteraction.js";
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

/** @type {NewPackagesDatabase | null} */
let cachedNewPackagesDatabase = null;
let hasWarnedAboutUnavailableNewPackagesDatabase = false;

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
 * @returns {Promise<NewPackagesDatabase>}
 */
export async function openNewPackagesDatabase() {
  if (cachedNewPackagesDatabase) {
    return cachedNewPackagesDatabase;
  }

  if (getEcoSystem() !== ECOSYSTEM_JS) {
    cachedNewPackagesDatabase = { isNewlyReleasedPackage: () => false };
    return cachedNewPackagesDatabase;
  }

  /** @type {import("../api/aikido.js").NewPackageEntry[]} */
  let newPackagesList;

  try {
    newPackagesList = await getNewPackagesList();
  } catch (/** @type {any} */ error) {
    if (!hasWarnedAboutUnavailableNewPackagesDatabase) {
      ui.writeWarning(
        `Failed to load the new packages list used for direct package download request blocking. Continuing with metadata-based minimum age checks only. ${error.message}`
      );
      hasWarnedAboutUnavailableNewPackagesDatabase = true;
    }

    cachedNewPackagesDatabase = { isNewlyReleasedPackage: () => false };
    return cachedNewPackagesDatabase;
  }

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

  cachedNewPackagesDatabase = { isNewlyReleasedPackage };
  return cachedNewPackagesDatabase;
}

/**
 * @returns {Promise<import("../api/aikido.js").NewPackageEntry[]>}
 */
async function getNewPackagesList() {
  const { newPackagesList: cachedList, version: cachedVersion } =
    readNewPackagesListFromLocalCache();

  try {
    if (cachedList) {
      const currentVersion = await fetchNewPackagesListVersion();
      if (cachedVersion === currentVersion) {
        return cachedList;
      }
    }

    const { newPackagesList, version } = await fetchNewPackagesList();

    if (version) {
      writeNewPackagesListToLocalCache(newPackagesList, version);
      return newPackagesList;
    } else {
      ui.writeWarning(
        "The new packages list for direct package download request blocking was downloaded, but could not be cached due to a missing version."
      );
      return newPackagesList;
    }
  } catch (/** @type {any} */ error) {
    if (cachedList) {
      ui.writeWarning(
        "Failed to fetch the latest new packages list for direct package download request blocking. Using cached version."
      );
      return cachedList;
    }
    throw error;
  }
}
