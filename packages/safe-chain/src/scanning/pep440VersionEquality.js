/**
 * Minimal PEP 440 (https://peps.python.org/pep-0440/) version equivalence
 * check. This deliberately only handles the equivalence that actually
 * causes safe-chain to miss malware matches in practice: trailing zero
 * release segments are insignificant (e.g. "1.0" == "1.0.0" == "1.0.0.0").
 *
 * Everything else in the version string (epoch, and any pre/post/dev/local
 * suffix) must match exactly for two versions to be considered equal. This
 * is a known limitation: spelling variants of pre/post/dev segments (e.g.
 * "1.0a1" vs "1.0.alpha1") are NOT normalized and will not be considered
 * equal. If a version string doesn't look like a version at all, we fall
 * back to plain string equality rather than throwing or guessing.
 */

const VERSION_PATTERN =
  /^\s*v?(?:(?<epoch>[0-9]+)!)?(?<release>[0-9]+(?:\.[0-9]+)*)(?<rest>.*?)\s*$/i;

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function pep440VersionsEqual(a, b) {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  if (!parsedA || !parsedB) {
    // Not something we recognize as a version - don't guess, just fall
    // back to whatever the caller would have done without this helper.
    return a === b;
  }

  return (
    parsedA.epoch === parsedB.epoch &&
    parsedA.rest === parsedB.rest &&
    releaseSegmentsEqual(parsedA.release, parsedB.release)
  );
}

/**
 * @param {string} version
 * @returns {{epoch: string, release: string, rest: string} | null}
 */
function parseVersion(version) {
  if (!version) {
    return null;
  }

  const match = VERSION_PATTERN.exec(version);
  if (!match?.groups) {
    return null;
  }

  return {
    epoch: match.groups.epoch ?? "0",
    release: match.groups.release,
    rest: match.groups.rest.trim().toLowerCase(),
  };
}

/**
 * @param {string} releaseA
 * @param {string} releaseB
 * @returns {boolean}
 */
function releaseSegmentsEqual(releaseA, releaseB) {
  const segmentsA = trimTrailingZeroSegments(releaseA.split("."));
  const segmentsB = trimTrailingZeroSegments(releaseB.split("."));

  return (
    segmentsA.length === segmentsB.length &&
    segmentsA.every((segment, i) => Number(segment) === Number(segmentsB[i]))
  );
}

/**
 * @param {string[]} segments
 * @returns {string[]}
 */
function trimTrailingZeroSegments(segments) {
  const trimmed = [...segments];
  while (trimmed.length > 1 && Number(trimmed[trimmed.length - 1]) === 0) {
    trimmed.pop();
  }
  return trimmed;
}
