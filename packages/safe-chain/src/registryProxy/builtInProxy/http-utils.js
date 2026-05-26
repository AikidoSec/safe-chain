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
 * Returns a copy of headers without the provided header names, matched
 * either exactly or case-insensitively.
 *
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @param {string[]} headerNames
 * @param {{ caseInsensitive?: boolean }} [options]
 * @returns {NodeJS.Dict<string | string[]> | undefined}
 */
export function omitHeaders(headers, headerNames, options = {}) {
  if (!headers) {
    return headers;
  }

  const omittedHeaderNames = new Set(
    options.caseInsensitive
      ? headerNames.map((name) => name.toLowerCase())
      : headerNames
  );
  /** @type {NodeJS.Dict<string | string[]>} */
  const filteredHeaders = {};

  for (const [headerName, value] of Object.entries(headers)) {
    const comparableHeaderName = options.caseInsensitive
      ? headerName.toLowerCase()
      : headerName;
    if (!omittedHeaderNames.has(comparableHeaderName)) {
      filteredHeaders[headerName] = value;
    }
  }

  return filteredHeaders;
}

/**
 * Remove headers that become stale when the response body is modified.
 *
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @returns {void}
 */
export function clearCachingHeaders(headers) {
  if (!headers) {
    return;
  }

  const filteredHeaders = omitHeaders(headers, [
    "etag",
    "last-modified",
    "cache-control",
    "content-length",
  ]);

  if (!filteredHeaders) {
    return;
  }

  for (const key of Object.keys(headers)) {
    delete headers[key];
  }

  Object.assign(headers, filteredHeaders);
}
