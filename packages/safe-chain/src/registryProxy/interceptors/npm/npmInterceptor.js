import { getNpmCustomRegistries, skipMinimumPackageAge } from "../../../config/settings.js";
import { isMalwarePackage } from "../../../scanning/audit/index.js";
import { interceptRequests } from "../interceptorBuilder.js";
import {
  isPackageInfoUrl,
  modifyNpmInfoRequestHeaders,
  modifyNpmInfoResponse,
} from "./modifyNpmInfo.js";
import { parseNpmPackageUrl } from "./parseNpmPackageUrl.js";
import { openMinimumPackageAgeChecker } from "../minimumPackageAgeChecker.js";

const knownJsRegistries = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "registry.npmjs.com",
];

/**
 * @param {string} url
 * @returns {import("../interceptorBuilder.js").Interceptor | undefined}
 */
export function npmInterceptorForUrl(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return undefined;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const port = parsedUrl.port;
  const pathname = parsedUrl.pathname;

  const registry = [...knownJsRegistries, ...getNpmCustomRegistries()].find(
    (reg) => {
      // Normalize the registry for comparison
      const regLower = reg.toLowerCase();
      const slashIndex = regLower.indexOf("/");
      const regHost = slashIndex === -1 ? regLower : regLower.substring(0, slashIndex);
      const regPath = slashIndex === -1 ? "" : regLower.substring(slashIndex);

      // Check if registry host contains a port
      const colonIndex = regHost.indexOf(":");
      const regHostname = colonIndex === -1 ? regHost : regHost.substring(0, colonIndex);
      const regPort = colonIndex === -1 ? "" : regHost.substring(colonIndex + 1);

      // Match hostname
      if (hostname !== regHostname && !hostname.endsWith("." + regHostname)) {
        return false;
      }

      // Match port if specified in registry
      if (regPort && port !== regPort) {
        return false;
      }

      // Match path prefix if specified in registry
      if (regPath && !pathname.startsWith(regPath)) {
        return false;
      }

      return true;
    }
  );

  if (registry) {
    return buildNpmInterceptor(registry);
  }

  return undefined;
}

/**
 * @param {string} registry
 * @returns {import("../interceptorBuilder.js").Interceptor}
 */
function buildNpmInterceptor(registry) {

  return interceptRequests(async (reqContext) => {
    const { packageName, version } = parseNpmPackageUrl(
      reqContext.targetUrl,
      registry
    );

    // Perform malware check; block if malicious or if identity is incomplete
    try {
      if (await isMalwarePackage(packageName, version)) {
        reqContext.blockMalware(packageName, version);
        return;
      }
    } catch (err) {
      // isMalwarePackage throws when package identity is incomplete.
      // Block the request to fail closed rather than forwarding unverified artifacts.
      reqContext.blockMalware(packageName, version);
      return;
    }

    if (skipMinimumPackageAge()) {
      // Bail out before opening any minimum-age database: when the check is
      // globally disabled there is nothing further to look up.
      return;
    }

    if (isPackageInfoUrl(reqContext.targetUrl)) {
      const checker = await openMinimumPackageAgeChecker();
      reqContext.modifyRequestHeaders(modifyNpmInfoRequestHeaders);
      reqContext.modifyBody((body, headers) =>
        modifyNpmInfoResponse(body, headers, checker)
      );
      return;
    }

    // For tarball requests the metadata check above is skipped, so we check the
    // new packages list as a fallback (covers e.g. frozen-lockfile installs).
    if (packageName && version) {
      const checker = await openMinimumPackageAgeChecker();

      if (
        !checker.isPackageExempt(packageName) &&
        checker.isTooNewByFeed(packageName, version)
      ) {
        reqContext.blockMinimumAgeRequest(
          packageName,
          version,
          `Forbidden - blocked by safe-chain direct download minimum package age (${packageName}@${version})`
        );
      }
    }
  });
}
