import { getEcoSystem, ECOSYSTEM_JS, ECOSYSTEM_PY } from "../config/settings.js";

export const knownJsRegistries = ["registry.npmjs.org","registry.yarnpkg.com"];
export const knownPipRegistries = ["files.pythonhosted.org", "pypi.org", "pypi.python.org", "pythonhosted.org"];

/**
 * @param {string} url
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
export function parsePackageFromUrl(url) {
  const ecosystem = getEcoSystem();
  let registry;

  // Only check registries that match the current ecosystem
  if (ecosystem === ECOSYSTEM_JS) {
    for (const knownRegistry of knownJsRegistries) {
      if (url.includes(knownRegistry)) {
        registry = knownRegistry;
        return parseJsPackageFromUrl(url, registry);
      }
    }
  } else if (ecosystem === ECOSYSTEM_PY) {
    for (const knownRegistry of knownPipRegistries) {
      if (url.includes(knownRegistry)) {
        registry = knownRegistry;
        return parsePipPackageFromUrl(url, registry);
      }
    }
  }

  // If no known registry matched, return { packageName: undefined, version: undefined }
  return { packageName: undefined, version: undefined };
}

/**
 * @param {string} url
 * @param {string} registry
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
function parseJsPackageFromUrl(url, registry) {
  let packageName, version;
  if (!registry || !url.endsWith(".tgz")) {
    return { packageName, version };
  }

  const registryIndex = url.indexOf(registry);
  const afterRegistry = url.substring(registryIndex + registry.length + 1); // +1 to skip the slash

  const separatorIndex = afterRegistry.indexOf("/-/");
  if (separatorIndex === -1) {
    return { packageName, version };
  }

  packageName = afterRegistry.substring(0, separatorIndex);
  const filename = afterRegistry.substring(
    separatorIndex + 3,
    afterRegistry.length - 4
  ); // Remove /-/ and .tgz

  // Extract version from filename
  // For scoped packages like @babel/core, the filename is core-7.21.4.tgz
  // For regular packages like lodash, the filename is lodash-4.17.21.tgz
  if (packageName.startsWith("@")) {
    const scopedPackageName = packageName.substring(
      packageName.lastIndexOf("/") + 1
    );
    if (filename.startsWith(scopedPackageName + "-")) {
      version = filename.substring(scopedPackageName.length + 1);
    }
  } else {
    if (filename.startsWith(packageName + "-")) {
      version = filename.substring(packageName.length + 1);
    }
  }

  return { packageName, version };
}

/**
 * @param {string} url
 * @param {string} registry
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
function parsePipPackageFromUrl(url, registry) {
  let packageName, version

  // Basic validation
  if (!registry || typeof url !== "string") {
    return { packageName, version};
  }

  // Quick sanity check on the URL + parse
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    return { packageName, version};
  }

  // Get the last path segment (filename) and decode it (strip query & fragment automatically)
  const lastSegment = urlObj.pathname.split("/").filter(Boolean).pop();
  if (!lastSegment){
    return { packageName, version};
  }

  const filename = decodeURIComponent(lastSegment);

  // Parse Python package downloads from PyPI/pythonhosted.org
  // Example wheel: https://files.pythonhosted.org/packages/xx/yy/requests-2.28.1-py3-none-any.whl
  // Example sdist: https://files.pythonhosted.org/packages/xx/yy/requests-2.28.1.tar.gz

  // Wheel (.whl)
  if (filename.endsWith(".whl")) {
    const base = filename.slice(0, -4); // remove ".whl"
    const firstDash = base.indexOf("-");
    if (firstDash > 0) {
      const dist = base.slice(0, firstDash);     // may contain underscores
      const rest = base.slice(firstDash + 1);    // version + the rest of tags
      const secondDash = rest.indexOf("-");
      const rawVersion = secondDash >= 0 ? rest.slice(0, secondDash) : rest;
      packageName = dist; // preserve underscores
      version = rawVersion;
      // Reject "latest" as it's a placeholder, not a real version
      // When version is "latest", this signals the URL doesn't contain actual version info
      // Returning undefined allows the request (see registryProxy.js isAllowedUrl)
      if (version === "latest" || !packageName || !version) {
        return { packageName: undefined, version: undefined };
      }
      return { packageName, version };
    }
  }

  // Source dist (sdist)
  const sdistExtMatch = filename.match(/\.(tar\.gz|zip|tar\.bz2|tar\.xz)$/i);
  if (sdistExtMatch) {
    const base = filename.slice(0, -sdistExtMatch[0].length);
    const lastDash = base.lastIndexOf("-");
    if (lastDash > 0 && lastDash < base.length - 1) {
      packageName = base.slice(0, lastDash);
      version = base.slice(lastDash + 1);
      // Reject "latest" as it's a placeholder, not a real version
      // When version is "latest", this signals the URL doesn't contain actual version info
      // Returning undefined allows the request (see registryProxy.js isAllowedUrl)
      if (version === "latest" || !packageName || !version) {
        return { packageName: undefined, version: undefined };
      }
      return { packageName, version };
    }
  }

  // Unknown file type or invalid
  return { packageName: undefined, version: undefined };
}
