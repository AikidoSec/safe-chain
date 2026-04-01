const state = {
  hasSuppressedVersions: false,
};

/**
 * Tracks whether any rewritten metadata response suppressed versions during the
 * current process lifetime. This is intentional shared state used only for the
 * end-of-run summary message exposed through the proxy API.
 *
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
