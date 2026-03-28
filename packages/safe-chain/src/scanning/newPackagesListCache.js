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
import { buildNewPackagesDatabase } from "./newPackagesDatabaseBuilder.js";
import { warnOnceAboutUnavailableDatabase } from "./newPackagesDatabaseWarnings.js";

/**
 * @typedef {import("./newPackagesDatabaseBuilder.js").NewPackagesDatabase} NewPackagesDatabase
 */

// Shared per-process cache to avoid rebuilding the same feed-backed database on each request.
/** @type {NewPackagesDatabase | null} */
let cachedNewPackagesDatabase = null;

/**
 * @returns {Promise<NewPackagesDatabase>}
 */
export async function openNewPackagesDatabase() {
  if (cachedNewPackagesDatabase) {
    return cachedNewPackagesDatabase;
  }

  /** @type {import("../api/aikido.js").NewPackageEntry[]} */
  let newPackagesList;

  try {
    newPackagesList = await getNewPackagesList();
  } catch (/** @type {any} */ error) {
    warnOnceAboutUnavailableDatabase(error);
    cachedNewPackagesDatabase = { isNewlyReleasedPackage: () => false };
    return cachedNewPackagesDatabase;
  }

  cachedNewPackagesDatabase = buildNewPackagesDatabase(newPackagesList);
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
