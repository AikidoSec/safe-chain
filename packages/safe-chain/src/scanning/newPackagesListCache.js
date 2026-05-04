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
// Caching the Promise (rather than the resolved database) prevents duplicate fetches. If we cached the resolved
// value, multiple callers could pass the null-check before the first fetch completes (because each `await` yields
// control back to the event loop, allowing other callers to run). Since the Promise assignment is synchronous, all
// concurrent callers see it immediately and share a single fetch.
/** @type {Promise<NewPackagesDatabase> | null} */
let cachedNewPackagesDatabasePromise = null;

/**
 * @returns {Promise<NewPackagesDatabase>}
 */
export function openNewPackagesDatabase() {
  if (!cachedNewPackagesDatabasePromise) {
    cachedNewPackagesDatabasePromise = getNewPackagesList()
      .then((newPackagesList) => buildNewPackagesDatabase(newPackagesList))
      .catch((/** @type {any} */ error) => {
        warnOnceAboutUnavailableDatabase(error);
        cachedNewPackagesDatabasePromise = null;
        return { isNewlyReleasedPackage: () => false };
      });
  }
  return cachedNewPackagesDatabasePromise;
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
