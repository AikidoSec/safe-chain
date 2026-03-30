/**
 * Parse Python package artifact URLs from PyPI-style registries.
 * Examples:
 * - Wheel: https://files.pythonhosted.org/packages/.../requests-2.28.1-py3-none-any.whl
 * - Wheel metadata: https://files.pythonhosted.org/packages/.../requests-2.28.1-py3-none-any.whl.metadata
 * - Sdist: https://files.pythonhosted.org/packages/.../requests-2.28.1.tar.gz
 *
 * @param {string} url
 * @param {string} registry
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
export function parsePipPackageFromUrl(url, registry) {
  if (!registry || typeof url !== "string") {
    return { packageName: undefined, version: undefined };
  }

  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    return { packageName: undefined, version: undefined };
  }

  const lastSegment = urlObj.pathname.split("/").filter(Boolean).pop();
  if (!lastSegment) {
    return { packageName: undefined, version: undefined };
  }

  const filename = decodeURIComponent(lastSegment);

  const wheelExtRe = /\.whl(?:\.metadata)?$/;
  if (wheelExtRe.test(filename)) {
    return parseWheelFilename(filename, wheelExtRe);
  }

  const sdistExtWithMetadataRe = /\.(tar\.gz|zip|tar\.bz2|tar\.xz)(\.metadata)?$/i;
  if (!sdistExtWithMetadataRe.test(filename)) {
    return { packageName: undefined, version: undefined };
  }

  return parseSdistFilename(filename, sdistExtWithMetadataRe);
}

/**
 * Parse wheel filenames and Poetry preflight metadata.
 * Examples:
 * - foo_bar-2.0.0-py3-none-any.whl
 * - foo_bar-2.0.0-py3-none-any.whl.metadata
 *
 * @param {string} filename
 * @param {RegExp} wheelExtRe
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
function parseWheelFilename(filename, wheelExtRe) {
  const base = filename.replace(wheelExtRe, "");
  const firstDash = base.indexOf("-");
  if (firstDash <= 0) {
    return { packageName: undefined, version: undefined };
  }

  const packageName = base.slice(0, firstDash);
  const rest = base.slice(firstDash + 1);
  const secondDash = rest.indexOf("-");
  const version = secondDash >= 0 ? rest.slice(0, secondDash) : rest;

  // "latest" is a resolver-style token, not an actual published artifact version.
  if (version === "latest" || !packageName || !version) {
    return { packageName: undefined, version: undefined };
  }

  return { packageName, version };
}

/**
 * Parse source distribution filenames, with optional metadata suffix.
 * Examples:
 * - requests-2.28.1.tar.gz
 * - requests-2.28.1.zip
 * - requests-2.28.1.tar.gz.metadata
 *
 * @param {string} filename
 * @param {RegExp} sdistExtWithMetadataRe
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
function parseSdistFilename(filename, sdistExtWithMetadataRe) {
  const base = filename.replace(sdistExtWithMetadataRe, "");
  const lastDash = base.lastIndexOf("-");
  if (lastDash <= 0 || lastDash >= base.length - 1) {
    return { packageName: undefined, version: undefined };
  }

  const packageName = base.slice(0, lastDash);
  const version = base.slice(lastDash + 1);

  // "latest" is a resolver-style token, not an actual published artifact version.
  if (version === "latest" || !packageName || !version) {
    return { packageName: undefined, version: undefined };
  }

  return { packageName, version };
}
