import {
  getEcoSystem,
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
} from "../config/settings.js";
import { getVersionsEqual } from "./audit/getVersionsEqual.js";
import { normalizePipPackageName } from "./packageNameVariants.js";

/**
 * @typedef {Object} SafePatchesDatabase
 * @property {function(string | undefined, string | undefined): boolean} isSafePatch
 */

/**
 * @typedef {Object} SafePatchEntry
 * @property {string} package_name
 * @property {string} version
 * @property {string} [ecosystem]
 */

/**
 * Returns the ecosystem identifier expected in the safe patches feed.
 * @returns {string}
 */
function getCurrentFeedEcosystem() {
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
 * Builds a lookup of packages that have been confirmed by the Aikido team to be
 * safe CVE patches, and are therefore exempt from the minimum package age check.
 *
 * Unlike the minimum package age exclusions list, matching is exact: a safe patch
 * entry exempts only the specific name+version pair it names, never a whole
 * package or a version range.
 *
 * @param {SafePatchEntry[]} safePatchesList
 * @returns {SafePatchesDatabase}
 */
export function buildSafePatchesDatabase(safePatchesList) {
  const ecosystem = getEcoSystem();
  const expectedEcosystem = getCurrentFeedEcosystem();
  const versionsEqual = getVersionsEqual();

  /**
   * @param {string} name
   * @returns {string}
   */
  function toLookupKey(name) {
    return ecosystem === ECOSYSTEM_PY ? normalizePipPackageName(name) : name;
  }

  /** @type {Map<string, SafePatchEntry[]>} */
  const entriesByName = new Map();
  for (const entry of safePatchesList) {
    const packageName = entry && entry.package_name;
    if (typeof packageName !== "string" || typeof entry.version !== "string") {
      continue;
    }
    if (entry.ecosystem && entry.ecosystem.toLowerCase() !== expectedEcosystem) {
      continue;
    }
    const key = toLookupKey(packageName);
    if (entriesByName.has(key)) {
      entriesByName.get(key)?.push(entry);
    } else {
      entriesByName.set(key, [entry]);
    }
  }

  /**
   * @param {string | undefined} name
   * @param {string | undefined} version
   * @returns {boolean}
   */
  function isSafePatch(name, version) {
    if (!name || !version) {
      return false;
    }

    const entries = entriesByName.get(toLookupKey(name));
    if (entries) {
      return entries.some((item) => versionsEqual(item.version, version));
    }

    return false;
  }

  return { isSafePatch };
}
