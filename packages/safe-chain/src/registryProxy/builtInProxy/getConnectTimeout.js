import { isImdsEndpoint } from "./isImdsEndpoint.js";

/**
 * Returns appropriate connection timeout for a host.
 * - IMDS endpoints: 3s (fail fast when outside cloud, reduce 5min delay to ~20s)
 * - Other endpoints: 30s (allow for slow networks while preventing indefinite hangs)
 */
export function getConnectTimeout(/** @type {string} */ host) {
  if (isImdsEndpoint(host)) {
    return 3000;
  }
  return 30000;
}
