import {
  getNpmCustomRegistries,
  getNpmMinimumPackageAgeExclusions,
  skipMinimumPackageAge,
} from "../../../config/settings.js";
import { isMalwarePackage } from "../../../scanning/audit/index.js";
import { interceptRequests } from "../interceptorBuilder.js";
import {
  isPackageInfoUrl,
  matchesExclusionPattern,
  modifyNpmInfoRequestHeaders,
  modifyNpmInfoResponse,
} from "./modifyNpmInfo.js";
import { parseNpmPackageUrl } from "./parseNpmPackageUrl.js";
import { openNewPackagesDatabase } from "../../../scanning/newPackagesDatabase.js";

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
  const registry = [...knownJsRegistries, ...getNpmCustomRegistries()].find(
    (reg) => url.includes(reg)
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

    if (await isMalwarePackage(packageName, version)) {
      reqContext.blockMalware(packageName, version);
      return;
    }

    if (!skipMinimumPackageAge() && isPackageInfoUrl(reqContext.targetUrl)) {
      reqContext.modifyRequestHeaders(modifyNpmInfoRequestHeaders);
      reqContext.modifyBody(modifyNpmInfoResponse);
      return;
    }

    // For tarball requests the metadata check above is skipped, so we check the
    // new packages list as a fallback (covers e.g. frozen-lockfile installs).
    if (!skipMinimumPackageAge() && packageName && version) {
      const exclusions = getNpmMinimumPackageAgeExclusions();
      const isExcluded = exclusions.some((pattern) =>
        matchesExclusionPattern(packageName, pattern)
      );

      if (!isExcluded) {
        const newPackagesDatabase = await openNewPackagesDatabase();

        if (newPackagesDatabase.isNewlyReleasedPackage(packageName, version)) {
          reqContext.blockMinimumAgeRequest(
            packageName,
            version,
            `Forbidden - blocked by safe-chain minimum package age (${packageName}@${version})`
          );
        }
      }
    }
  });
}
