// Instance Metadata Service (IMDS) endpoints used by cloud providers.
// Cloud SDK tools probe these to detect environment and retrieve credentials.
// When outside cloud environments, connections timeout - we reduce timeout (3s vs 30s)
// and suppress error logging since this is expected behavior.
const imdsEndpoints = [
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254",
];

export function isImdsEndpoint(/** @type {string} */ host) {
  return imdsEndpoints.includes(host);
}
