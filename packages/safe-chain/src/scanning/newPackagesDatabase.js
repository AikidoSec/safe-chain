import fs from "fs";
import {
  fetchNewPackagesList,
  fetchNewPackagesListVersion,
} from "../api/aikido.js";
import {
  getNewPackagesListPath,
  getNewPackagesListVersionPath,
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

// Shared per-process cache to avoid rebuilding the same feed-backed database on each request.
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

/**
 * @param {import("../api/aikido.js").NewPackageEntry[]} data
 * @param {string | number} version
 *
 * @returns {void}
 */
export function writeNewPackagesListToLocalCache(data, version) {
  try {
    const listPath = getNewPackagesListPath();
    const versionPath = getNewPackagesListVersionPath();

    fs.writeFileSync(listPath, JSON.stringify(data));
    fs.writeFileSync(versionPath, version.toString());
  } catch {
    ui.writeWarning(
      "Failed to write new packages list to local cache, next time the list will be fetched from the server again."
    );
  }
}

/**
 * @returns {{newPackagesList: import("../api/aikido.js").NewPackageEntry[] | null, version: string | null}}
 */
export function readNewPackagesListFromLocalCache() {
  try {
    const listPath = getNewPackagesListPath();
    if (!fs.existsSync(listPath)) {
      return { newPackagesList: null, version: null };
    }

    const data = fs.readFileSync(listPath, "utf8");
    const newPackagesList = JSON.parse(data);
    const versionPath = getNewPackagesListVersionPath();
    let version = null;
    if (fs.existsSync(versionPath)) {
      version = fs.readFileSync(versionPath, "utf8").trim();
    }
    return { newPackagesList, version };
  } catch {
    ui.writeWarning(
      "Failed to read new packages list from local cache. Continuing without local cache."
    );
    return { newPackagesList: null, version: null };
  }
}
