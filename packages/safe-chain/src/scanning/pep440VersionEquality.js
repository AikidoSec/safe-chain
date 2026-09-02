/**
 * PEP 440 (https://peps.python.org/pep-0440/) version equivalence check.
 *
 * PEP 440 allows the same release to be spelled in multiple ways, e.g.:
 *   - "1.0" == "1.0.0" == "1.0.0.0"        (trailing zero release segments)
 *   - "1.0a1" == "1.0alpha1" == "1.0-a1"   (pre-release spelling/separators)
 *   - "1.0-1" == "1.0.post1" == "1.0-r1"   (implicit/explicit post-release)
 *   - "1.0.dev" == "1.0.dev0"              (missing release-segment number)
 *   - "01!1.0" == "1!1.0"                  (leading zeros in numeric parts)
 *
 * A malware database entry recorded under one spelling must still match a
 * request using an equivalent spelling, otherwise malware slips through.
 * This module normalizes both sides and compares for *equality* only (not
 * full PEP 440 ordering/range logic - that's not needed here).
 *
 * If a version string doesn't look like a version at all, we fall back to
 * plain string equality rather than throwing or guessing.
 */

const VERSION_PATTERN =
  /^\s*v?(?:(?<epoch>[0-9]+)!)?(?<release>[0-9]+(?:\.[0-9]+)*)(?:[-_.]?(?<preLetter>a|b|c|rc|alpha|beta|pre|preview)[-_.]?(?<preNumber>[0-9]+)?)?(?:(?:-(?<postNumberImplicit>[0-9]+))|(?:[-_.]?(?<postLetter>post|rev|r)[-_.]?(?<postNumber>[0-9]+)?))?(?:[-_.]?(?<devLetter>dev)[-_.]?(?<devNumber>[0-9]+)?)?(?:\+(?<local>[a-z0-9]+(?:[-_.][a-z0-9]+)*))?\s*$/i;

/** @type {Record<string, string>} */
const PRE_LETTER_ALIASES = {
  a: "a",
  alpha: "a",
  b: "b",
  beta: "b",
  c: "rc",
  rc: "rc",
  pre: "rc",
  preview: "rc",
};

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
    releaseSegmentsEqual(parsedA.release, parsedB.release) &&
    preEqual(parsedA.pre, parsedB.pre) &&
    numberedPartEqual(parsedA.post, parsedB.post) &&
    numberedPartEqual(parsedA.dev, parsedB.dev) &&
    localEqual(parsedA.local, parsedB.local)
  );
}

/**
 * @typedef {Object} ParsedVersion
 * @property {bigint} epoch
 * @property {string} release
 * @property {{letter: string, number: bigint} | null} pre
 * @property {{number: bigint} | null} post
 * @property {{number: bigint} | null} dev
 * @property {string[] | null} local
 */

/**
 * @param {string} version
 * @returns {ParsedVersion | null}
 */
function parseVersion(version) {
  if (!version) {
    return null;
  }

  const match = VERSION_PATTERN.exec(version);
  if (!match?.groups) {
    return null;
  }
  const g = match.groups;

  return {
    epoch: BigInt(g.epoch ?? "0"),
    release: g.release,
    pre: parsePre(g),
    post: parsePost(g),
    dev: parseDev(g),
    local: parseLocal(g),
  };
}

/**
 * @param {Record<string, string | undefined>} g
 * @returns {{letter: string, number: bigint} | null}
 */
function parsePre(g) {
  if (!g.preLetter) {
    return null;
  }
  return {
    letter: PRE_LETTER_ALIASES[g.preLetter.toLowerCase()],
    number: BigInt(g.preNumber ?? "0"),
  };
}

/**
 * A post-release can be written as an explicit "post"/"rev"/"r" letter, or
 * as a bare "-N" directly after the release segment (implicit post-release).
 * @param {Record<string, string | undefined>} g
 * @returns {{number: bigint} | null}
 */
function parsePost(g) {
  if (g.postNumberImplicit !== undefined) {
    return { number: BigInt(g.postNumberImplicit) };
  }
  if (!g.postLetter) {
    return null;
  }
  return { number: BigInt(g.postNumber ?? "0") };
}

/**
 * @param {Record<string, string | undefined>} g
 * @returns {{number: bigint} | null}
 */
function parseDev(g) {
  if (!g.devLetter) {
    return null;
  }
  return { number: BigInt(g.devNumber ?? "0") };
}

/**
 * @param {Record<string, string | undefined>} g
 * @returns {string[] | null}
 */
function parseLocal(g) {
  if (!g.local) {
    return null;
  }
  return g.local.toLowerCase().split(/[-_.]/);
}

/**
 * @param {string} releaseA
 * @param {string} releaseB
 * @returns {boolean}
 */
function releaseSegmentsEqual(releaseA, releaseB) {
  const segmentsA = trimTrailingZeroSegments(releaseA.split("."));
  const segmentsB = trimTrailingZeroSegments(releaseB.split("."));

  // Segments are guaranteed to be digit-only by VERSION_PATTERN, and PEP 440
  // release segments have no fixed width limit, so compare with BigInt
  // rather than Number to avoid precision loss on very large segments
  // (e.g. "9007199254740992" vs "9007199254740993" must stay distinct).
  return (
    segmentsA.length === segmentsB.length &&
    segmentsA.every((segment, i) => BigInt(segment) === BigInt(segmentsB[i]))
  );
}

/**
 * @param {string[]} segments
 * @returns {string[]}
 */
function trimTrailingZeroSegments(segments) {
  const trimmed = [...segments];
  while (trimmed.length > 1 && BigInt(trimmed[trimmed.length - 1]) === 0n) {
    trimmed.pop();
  }
  return trimmed;
}

/**
 * @param {{letter: string, number: bigint} | null} preA
 * @param {{letter: string, number: bigint} | null} preB
 * @returns {boolean}
 */
function preEqual(preA, preB) {
  if (!preA || !preB) {
    return preA === preB;
  }
  return preA.letter === preB.letter && preA.number === preB.number;
}

/**
 * @param {{number: bigint} | null} partA
 * @param {{number: bigint} | null} partB
 * @returns {boolean}
 */
function numberedPartEqual(partA, partB) {
  if (!partA || !partB) {
    return partA === partB;
  }
  return partA.number === partB.number;
}

/**
 * PEP 440 local-version equality: compare segment by segment (separators
 * are not significant), treating all-digit segments as numbers (so leading
 * zeros don't matter) and everything else as case-insensitive strings.
 * Unlike the release segment, there's no trailing-zero equivalence here.
 * @param {string[] | null} localA
 * @param {string[] | null} localB
 * @returns {boolean}
 */
function localEqual(localA, localB) {
  if (!localA || !localB) {
    return localA === localB;
  }
  if (localA.length !== localB.length) {
    return false;
  }
  return localA.every((segment, i) => {
    const other = localB[i];
    if (/^[0-9]+$/.test(segment) && /^[0-9]+$/.test(other)) {
      return BigInt(segment) === BigInt(other);
    }
    return segment === other;
  });
}
