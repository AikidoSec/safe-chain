import { getPipCustomRegistries } from "../../config/settings.js";
import { isMalwarePackage } from "../../scanning/audit/index.js";
import { interceptRequests } from "./interceptorBuilder.js";

const knownPipRegistries = [
  "files.pythonhosted.org",
  "pypi.org",
  "pypi.python.org",
  "pythonhosted.org",
];

/**
 * @param {string} url
 * @returns {import("./interceptorBuilder.js").Interceptor | undefined}
 */
export function pipInterceptorForUrl(url) {
  const customRegistries = getPipCustomRegistries();
  const registries = [...knownPipRegistries, ...customRegistries];
  const registry = registries.find((reg) => url.includes(reg));

  if (registry) {
    return buildPipInterceptor(registry);
  }

  return undefined;
}

/**
 * @param {string} registry
 * @returns {import("./interceptorBuilder.js").Interceptor | undefined}
 */
function buildPipInterceptor(registry) {
  return interceptRequests(async (reqContext) => {
    const { packageName, version } = parsePipPackageFromUrl(
      reqContext.targetUrl,
      registry
    );

    // Normalize underscores to hyphens for DB matching, as PyPI allows underscores in distribution names.
    // Per python, packages that differ only by hyphen vs underscore are considered the same.
    const hyphenName = packageName?.includes("_") ? packageName.replace(/_/g, "-") : packageName;

    const isMalicious =
       await isMalwarePackage(packageName, version)
    || await isMalwarePackage(hyphenName, version);

    if (isMalicious) {
      reqContext.blockMalware(packageName, version);
    }
  });
}

/**
 * @param {string} url
 * @param {string} registry
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
function parsePipPackageFromUrl(url, registry) {
  let packageName, version;

  // Basic validation
  if (!registry || typeof url !== "string") {
    return { packageName, version };
  }

  // Quick sanity check on the URL + parse
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    return { packageName, version };
  }

  // Get the last path segment (filename) and decode it (strip query & fragment automatically)
  const lastSegment = urlObj.pathname.split("/").filter(Boolean).pop();
  if (!lastSegment) {
    return { packageName, version };
  }

  const filename = decodeURIComponent(lastSegment);

  // Parse Python package downloads from PyPI/pythonhosted.org
  // Example wheel: https://files.pythonhosted.org/packages/xx/yy/requests-2.28.1-py3-none-any.whl
  // Example sdist: https://files.pythonhosted.org/packages/xx/yy/requests-2.28.1.tar.gz

  // Wheel (.whl) and Poetry's preflight metadata (.whl.metadata)
  // Examples:
  //   foo_bar-2.0.0-py3-none-any.whl
  //   foo_bar-2.0.0-py3-none-any.whl.metadata
  const wheelExtRe = /\.whl(?:\.metadata)?$/;
  const wheelExtMatch = filename.match(wheelExtRe);
  if (wheelExtMatch) {
    const base = filename.replace(wheelExtRe, "");
    const firstDash = base.indexOf("-");
    if (firstDash > 0) {
      const dist = base.slice(0, firstDash); // may contain underscores
      const rest = base.slice(firstDash + 1); // version + the rest of tags
      const secondDash = rest.indexOf("-");
      const rawVersion = secondDash >= 0 ? rest.slice(0, secondDash) : rest;
      packageName = dist;
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

  // Source dist (sdist) and potential metadata sidecars (e.g., .tar.gz.metadata)
  const sdistExtWithMetadataRe = /\.(tar\.gz|zip|tar\.bz2|tar\.xz)(\.metadata)?$/i;
  const sdistExtMatch = filename.match(sdistExtWithMetadataRe);
  if (sdistExtMatch) {
    const base = filename.replace(sdistExtWithMetadataRe, "");
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
