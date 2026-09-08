import { getEcoSystem, ECOSYSTEM_PY } from "../../config/settings.js";
import { pep440VersionsEqual } from "../pep440VersionEquality.js";

/**
 * Picks the version-equality comparator to use when matching against the
 * malware database, based on the current ecosystem. Python packages follow
 * PEP 440 versioning (where e.g. "1.0" and "1.0.0" are the same release),
 * while other ecosystems fall back to exact string equality.
 * @returns {(a: string, b: string) => boolean}
 */

export function getVersionsEqual() {
  return getEcoSystem() === ECOSYSTEM_PY
    ? pep440VersionsEqual
    : (a, b) => a === b;
}
