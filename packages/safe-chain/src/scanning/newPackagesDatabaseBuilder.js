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
   * Python only. The PyPI feed carries display names (`Foo-Bar`),
   * but pip only ever requests the PEP 503 normalised form
   * (`foo-bar`), so both sides are folded to the same key.
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
  let caseFoldedCount = 0; // TEMP-CASE-FIX
  let separatorOnlyCount = 0; // TEMP-CASE-FIX
  for (const pkg of newPackagesList) {
    if (pkg.source && pkg.source.toLowerCase() !== expectedSource) {
      continue;
    }
    const rawName = pkg.package_name;
    const normalizedName = toLookupKey(rawName);
    // TEMP-CASE-FIX: separator-only folds were ALREADY handled before this fix
    // (via getEquivalentPackageNames); only the case folds were unreachable.
    if (normalizedName !== rawName) {
      if (rawName === rawName.toLowerCase()) {
        separatorOnlyCount++;
      } else {
        caseFoldedCount++;
      }
    }
    const key = `${normalizedName} ${pkg.version}`;
    if (!entriesByNameAndVersion.has(key)) {
      entriesByNameAndVersion.set(key, pkg);
    }
  }

  // TEMP-CASE-FIX: remove before merge.
  // oxlint-disable-next-line no-console
  console.warn(
    `[TEMP-CASE-FIX] indexed ${entriesByNameAndVersion.size} feed entries ` +
      `(ecosystem=${ecosystem}, keying=${ecosystem === ECOSYSTEM_PY ? "PEP503-normalized" : "verbatim"}); ` +
      `${caseFoldedCount} name(s) needed CASE folding (unreachable before this fix), ` +
      `${separatorOnlyCount} needed separator-only folding (already worked before)`
  );

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

    const lookupKey = toLookupKey(name);
    const entry = entriesByNameAndVersion.get(`${lookupKey} ${version}`);
    if (entry) {
      const isTooYoung = new Date(entry.released_on * 1000) > cutOff;
      // TEMP-CASE-FIX: remove before merge.
      // oxlint-disable-next-line no-console
      console.warn(
        `[TEMP-CASE-FIX] MATCH requested="${name}@${version}" -> key="${lookupKey}" ` +
          `matched feed entry "${entry.package_name}@${entry.version}" ` +
          `(tooYoung=${isTooYoung}${name !== entry.package_name ? ", CASE/SEPARATOR FOLD APPLIED" : ""})`
      );
      return isTooYoung;
    }

    return false;
  }

  return { isNewlyReleasedPackage };
}
