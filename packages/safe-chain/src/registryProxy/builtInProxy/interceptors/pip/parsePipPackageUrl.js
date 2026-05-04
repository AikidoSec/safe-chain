/**
 * Parses a PyPI metadata URL and returns the package name and API type.
 *
 * @example
 * parsePipMetadataUrl("https://pypi.org/simple/requests/")
 * // => { packageName: "requests", type: "simple" }
 *
 * parsePipMetadataUrl("https://pypi.org/pypi/requests/json")
 * // => { packageName: "requests", type: "json" }
 *
 * parsePipMetadataUrl("https://pypi.org/pypi/requests/2.28.1/json")
 * // => { packageName: "requests", type: "json" }
 *
 * parsePipMetadataUrl("https://files.pythonhosted.org/packages/requests-2.28.1.tar.gz")
 * // => { packageName: undefined, type: undefined }
 *
 * @param {string} url
 * @returns {{ packageName: string | undefined, type: "simple" | "json" | undefined }}
 */
export function parsePipMetadataUrl(url) {
  if (typeof url !== "string") {
    return { packageName: undefined, type: undefined };
  }

  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    return { packageName: undefined, type: undefined };
  }

  const pathSegments = urlObj.pathname.split("/").filter(Boolean);
  if (pathSegments[0] === "simple" && pathSegments[1]) {
    return {
      packageName: decodeURIComponent(pathSegments[1]),
      type: "simple",
    };
  }

  if (
    pathSegments[0] === "pypi" &&
    pathSegments[pathSegments.length - 1] === "json" &&
    pathSegments[1]
  ) {
    return {
      packageName: decodeURIComponent(pathSegments[1]),
      type: "json",
    };
  }

  return { packageName: undefined, type: undefined };
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isPipPackageInfoUrl(url) {
  return !!parsePipMetadataUrl(url).packageName;
}

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
