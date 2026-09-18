import { skipMinimumPackageAge } from "../../config/settings.js";
import { getMinimumPackageAgeCutoff } from "../../scanning/minimumPackageAgeCutoff.js";
import { openNewPackagesDatabase } from "../../scanning/newPackagesListCache.js";
import { openSafePatchesDatabase } from "../../scanning/safePatchesListCache.js";
import { isExcludedFromMinimumPackageAge } from "./minimumPackageAgeExclusions.js";
import { ui } from "../../environment/userInteraction.js";

/**
 * @typedef {Object} MinimumPackageAgeChecker
 * @property {function(string | undefined): boolean} isPackageExempt
 * @property {function(string | undefined, string | undefined): boolean} isTooNewByFeed
 * @property {function(string | undefined, string | undefined, string): boolean} isTooNewByReleaseDate
 */

/** @type {import("../../scanning/safePatchesDatabaseBuilder.js").SafePatchesDatabase} */
const NO_SAFE_PATCHES = { isSafePatch: () => false };

/**
 * Centralizes the "is this version too new to install?" decision.
 *
 * There are two independent sources of evidence for that decision, and both must
 * be kept:
 *
 *  - `isTooNewByFeed` trusts Aikido's release feed (`released_on`). It has the
 *    exact same signature as the `isNewlyReleasedPackage` it replaces, so it can
 *    be dropped into every call site that already injects that predicate.
 *  - `isTooNewByReleaseDate` trusts the registry's own per-version `time` metadata,
 *    which is what npm's metadata endpoint returns. It is more authoritative for
 *    npm (real timestamps, and it covers packages the feed never scraped), so it
 *    is kept as its own named method rather than folded into `isTooNewByFeed`
 *    behind an optional timestamp parameter - an optional parameter would make
 *    the evidence source implicit, and a caller passing the wrong arguments in
 *    the wrong order would silently downgrade enforcement instead of failing loudly.
 *
 * `isPackageExempt` is deliberately separate from both `isTooNew*` methods, and
 * must be called once per package rather than once per version: it reads the
 * (unmemoized) config file via `isExcludedFromMinimumPackageAge`, and a metadata
 * response can carry thousands of versions.
 *
 * `allowSafePatches` must be false for any registry that isn't one of the known
 * public ones (registry.npmjs.org, pypi.org, etc). A safe patch entry only
 * certifies the specific artifact Aikido inspected on the public registry - a
 * custom/private registry can publish an unrelated, unvetted artifact under the
 * exact same ecosystem+name+version, and matching on that tuple alone would
 * wrongly exempt it too. When false, the safe patches database is never
 * consulted, regardless of what is passed in.
 *
 * @param {{ newPackagesDatabase: import("../../scanning/newPackagesDatabaseBuilder.js").NewPackagesDatabase, safePatchesDatabase: import("../../scanning/safePatchesDatabaseBuilder.js").SafePatchesDatabase, allowSafePatches?: boolean }} databases
 * @returns {MinimumPackageAgeChecker}
 */
export function createMinimumPackageAgeChecker({
  newPackagesDatabase,
  safePatchesDatabase,
  allowSafePatches = true,
}) {
  const effectiveSafePatchesDatabase = allowSafePatches
    ? safePatchesDatabase
    : NO_SAFE_PATCHES;

  /**
   * @param {string | undefined} packageName
   * @returns {boolean}
   */
  function isPackageExempt(packageName) {
    return skipMinimumPackageAge() || isExcludedFromMinimumPackageAge(packageName);
  }

  /**
   * @param {string | undefined} name
   * @param {string | undefined} version
   * @returns {boolean}
   */
  function isTooNewByFeed(name, version) {
    // Cheap check first: the safe-patches lookup is only consulted for the rare
    // version that would otherwise be blocked, not for every version in a feed.
    if (!newPackagesDatabase.isNewlyReleasedPackage(name, version)) {
      return false;
    }

    if (effectiveSafePatchesDatabase.isSafePatch(name, version)) {
      logSafePatchExemption(name, version);
      return false;
    }

    return true;
  }

  /**
   * @param {string | undefined} name
   * @param {string | undefined} version
   * @param {string} timestamp
   * @returns {boolean}
   */
  function isTooNewByReleaseDate(name, version, timestamp) {
    if (!(new Date(timestamp) > getMinimumPackageAgeCutoff())) {
      // Common case: most versions were not published within the age window.
      return false;
    }

    if (effectiveSafePatchesDatabase.isSafePatch(name, version)) {
      logSafePatchExemption(name, version);
      return false;
    }

    return true;
  }

  return { isPackageExempt, isTooNewByFeed, isTooNewByReleaseDate };
}

/**
 * @param {string | undefined} name
 * @param {string | undefined} version
 */
function logSafePatchExemption(name, version) {
  ui.writeVerbose(
    `Safe-chain: ${name}@${version} is a confirmed safe patch and is exempt from the minimum package age check.`
  );
}

/**
 * @param {{ allowSafePatches?: boolean }} [options]
 * @returns {Promise<MinimumPackageAgeChecker>}
 */
export async function openMinimumPackageAgeChecker({
  allowSafePatches = true,
} = {}) {
  const [newPackagesDatabase, safePatchesDatabase] = await Promise.all([
    openNewPackagesDatabase(),
    // Skip the fetch entirely when this call site can never use it - e.g. a
    // request routed to a custom/private registry.
    allowSafePatches ? openSafePatchesDatabase() : Promise.resolve(NO_SAFE_PATCHES),
  ]);

  return createMinimumPackageAgeChecker({
    newPackagesDatabase,
    safePatchesDatabase,
    allowSafePatches,
  });
}
