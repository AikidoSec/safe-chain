/**
 * Tracks the package manager name (e.g. "pnpm", "npm", "yarn") that this
 * invocation is shimming. Stored as a small standalone module so that
 * lightweight config readers can branch on it without transitively importing
 * the heavy package-manager creator graph.
 */

/** @type {{name: string | null}} */
const state = { name: null };

/**
 * @param {string | null} name
 */
export function setPackageManagerName(name) {
  state.name = name;
}

/**
 * @returns {string | null}
 */
export function getPackageManagerName() {
  return state.name;
}
