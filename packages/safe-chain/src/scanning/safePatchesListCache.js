import fs from "fs";
import {
  fetchSafePatchesList,
  fetchSafePatchesListVersion,
} from "../api/aikido.js";
import {
  getSafePatchesListPath,
  getSafePatchesListVersionPath,
} from "../config/configFile.js";
import { ui } from "../environment/userInteraction.js";
import { buildSafePatchesDatabase } from "./safePatchesDatabaseBuilder.js";
import { warnOnceAboutUnavailableSafePatchesDatabase } from "./safePatchesDatabaseWarnings.js";

/**
 * @typedef {import("./safePatchesDatabaseBuilder.js").SafePatchesDatabase} SafePatchesDatabase
 */

// Shared per-process cache to avoid rebuilding the same feed-backed database on each request.
// Caching the Promise (rather than the resolved database) prevents duplicate fetches - see
// newPackagesListCache.js for the full rationale, which applies identically here.
/** @type {Promise<SafePatchesDatabase> | null} */
let cachedSafePatchesDatabasePromise = null;

/**
 * @returns {Promise<SafePatchesDatabase>}
 */
export function openSafePatchesDatabase() {
  if (!cachedSafePatchesDatabasePromise) {
    cachedSafePatchesDatabasePromise = getSafePatchesList()
      .then((safePatchesList) => buildSafePatchesDatabase(safePatchesList))
      .catch((/** @type {any} */ error) => {
        warnOnceAboutUnavailableSafePatchesDatabase(error);
        cachedSafePatchesDatabasePromise = null;
        // Failing open here means treating the safe patches list as empty, i.e. the
        // minimum package age check still applies to every package - fail-closed on
        // the actual security decision, which is the safe direction for an exemption list.
        return { isSafePatch: () => false };
      });
  }
  return cachedSafePatchesDatabasePromise;
}

/**
 * @returns {Promise<import("../api/aikido.js").SafePatchEntry[]>}
 */
async function getSafePatchesList() {
  const { safePatchesList: cachedList, version: cachedVersion } =
    readSafePatchesListFromLocalCache();

  try {
    if (cachedList) {
      const currentVersion = await fetchSafePatchesListVersion();
      if (cachedVersion === currentVersion) {
        return cachedList;
      }
    }

    const { safePatchesList, version } = await fetchSafePatchesList();

    if (version) {
      writeSafePatchesListToLocalCache(safePatchesList, version);
      return safePatchesList;
    } else {
      ui.writeWarning(
        "The safe patches list was downloaded, but could not be cached due to a missing version."
      );
      return safePatchesList;
    }
  } catch (/** @type {any} */ error) {
    if (cachedList) {
      ui.writeWarning(
        "Failed to fetch the latest safe patches list. Using cached version."
      );
      return cachedList;
    }
    throw error;
  }
}

/**
 * @param {import("../api/aikido.js").SafePatchEntry[]} data
 * @param {string | number} version
 *
 * @returns {void}
 */
export function writeSafePatchesListToLocalCache(data, version) {
  try {
    const listPath = getSafePatchesListPath();
    const versionPath = getSafePatchesListVersionPath();

    fs.writeFileSync(listPath, JSON.stringify(data));
    fs.writeFileSync(versionPath, version.toString());
  } catch {
    ui.writeWarning(
      "Failed to write safe patches list to local cache, next time the list will be fetched from the server again."
    );
  }
}

/**
 * @returns {{safePatchesList: import("../api/aikido.js").SafePatchEntry[] | null, version: string | null}}
 */
export function readSafePatchesListFromLocalCache() {
  try {
    const listPath = getSafePatchesListPath();
    if (!fs.existsSync(listPath)) {
      return { safePatchesList: null, version: null };
    }

    const data = fs.readFileSync(listPath, "utf8");
    const safePatchesList = JSON.parse(data);
    const versionPath = getSafePatchesListVersionPath();
    let version = null;
    if (fs.existsSync(versionPath)) {
      version = fs.readFileSync(versionPath, "utf8").trim();
    }
    return { safePatchesList, version };
  } catch {
    ui.writeWarning(
      "Failed to read safe patches list from local cache. Continuing without local cache."
    );
    return { safePatchesList: null, version: null };
  }
}
