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
