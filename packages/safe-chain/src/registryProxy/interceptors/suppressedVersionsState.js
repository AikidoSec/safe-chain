const state = {
  hasSuppressedVersions: false,
};

/**
 * @returns {void}
 */
export function recordSuppressedVersion() {
  state.hasSuppressedVersions = true;
}

/**
 * @returns {boolean}
 */
export function getHasSuppressedVersions() {
  return state.hasSuppressedVersions;
}
