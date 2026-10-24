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
 * Wheel format: {distribution}-{version}(-{build tag})?-{python tag}-{abi tag}-{platform tag}.whl
 * PEP 440 allows hyphens in version strings (e.g., 1.0-1 is equivalent to 1.0.post1),
 * so we must carefully parse to find the correct package/version boundary.
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
  
  // Wheel format has at least 3 dashes after the version: -py-abi-platform
  // We need to find where the version ends. The version must start with a digit
  // and is followed by platform tags (which typically start with 'py', 'cp', etc.)
  // We look for the pattern: version-{python_tag}-{abi_tag}-{platform_tag}
  // The python tag typically starts with 'py', 'cp', or is a build tag (digit).
  
  // Find all dashes in the rest
  const dashIndices = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "-") {
      dashIndices.push(i);
    }
  }
  
  // We need at least 2 dashes for the minimum wheel format (version-python-abi-platform)
  // But the version itself might contain dashes (PEP 440)
  // Strategy: Find the rightmost dash sequence that looks like platform tags
  // Platform tags are typically: py3, py2, cp38, etc. followed by abi and platform
  
  let versionEndIndex = -1;
  
  // Look for the pattern where we have at least 2 dashes remaining (for abi and platform)
  // and the segment after the dash looks like a python tag
  for (let i = 0; i < dashIndices.length - 1; i++) {
    const segmentStart = i === 0 ? 0 : dashIndices[i - 1] + 1;
    const segmentEnd = dashIndices[i];
    const nextSegmentStart = dashIndices[i] + 1;
    const nextSegmentEnd = i + 1 < dashIndices.length ? dashIndices[i + 1] : rest.length;
    
    const currentSegment = rest.slice(segmentStart, segmentEnd);
    const nextSegment = rest.slice(nextSegmentStart, nextSegmentEnd);
    
    // Check if nextSegment looks like a python/abi tag (starts with py, cp, or is 'none', 'any', etc.)
    if (/^(py|cp|pp|ip|jy)\d*$|^(none|any|abi\d+)$/i.test(nextSegment)) {
      versionEndIndex = dashIndices[i];
      break;
    }
  }
  
  const version = versionEndIndex >= 0 ? rest.slice(0, versionEndIndex) : rest.slice(0, dashIndices[0] >= 0 ? dashIndices[0] : rest.length);

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
 * PEP 440 allows hyphens in version strings (e.g., 1.0-1 is equivalent to 1.0.post1),
 * so we must find the correct package/version boundary by locating the leftmost hyphen
 * followed by a digit. This ensures "victim-1.0-1" is parsed as package "victim" with
 * version "1.0-1", not as package "victim-1.0" with version "1".
 *
 * @param {string} filename
 * @param {RegExp} sdistExtWithMetadataRe
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
function parseSdistFilename(filename, sdistExtWithMetadataRe) {
  const base = filename.replace(sdistExtWithMetadataRe, "");
  
  // Find the leftmost hyphen where what follows starts with a digit.
  // This handles cases like "victim-1.0-1" where the version is "1.0-1" (PEP 440 post-release).
  // We scan from left to right to find the package/version boundary.
  let splitIndex = -1;
  for (let i = 0; i < base.length - 1; i++) {
    if (base[i] === "-" && /^\d/.test(base[i + 1])) {
      splitIndex = i;
      break;
    }
  }
  
  if (splitIndex <= 0 || splitIndex >= base.length - 1) {
    return { packageName: undefined, version: undefined };
  }

  const packageName = base.slice(0, splitIndex);
  const version = base.slice(splitIndex + 1);

  // "latest" is a resolver-style token, not an actual published artifact version.
  if (version === "latest" || !packageName || !version) {
    return { packageName: undefined, version: undefined };
  }

  return { packageName, version };
}
