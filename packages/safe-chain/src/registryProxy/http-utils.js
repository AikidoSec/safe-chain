/**
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @param {string} headerName
 */
export function getHeaderValueAsString(headers, headerName) {
  if (!headers) {
    return undefined;
  }

  let header = headers[headerName];

  if (Array.isArray(header)) {
    return header.join(", ");
  }

  return header;
}

/**
 * Remove headers that become stale when the response body is modified.
 * Mutates the provided headers object in place.
 *
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @returns {void}
 */
export function clearCachingHeaders(headers) {
  if (!headers) {
    return;
  }

  delete headers["etag"];
  delete headers["last-modified"];
  delete headers["cache-control"];
  delete headers["content-length"];
}
