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
  const registry = knownPipRegistries.find((reg) => url.includes(reg));

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
    if (await isMalwarePackage(packageName, version)) {
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

  // Wheel (.whl)
  if (filename.endsWith(".whl")) {
    const base = filename.slice(0, -4); // remove ".whl"
    const firstDash = base.indexOf("-");
    if (firstDash > 0) {
      const dist = base.slice(0, firstDash); // may contain underscores
      const rest = base.slice(firstDash + 1); // version + the rest of tags
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
