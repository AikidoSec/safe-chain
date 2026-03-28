import {
  getNpmCustomRegistries,
  skipMinimumPackageAge,
} from "../../../config/settings.js";
import { isMalwarePackage } from "../../../scanning/audit/index.js";
import { interceptRequests } from "../interceptorBuilder.js";
import {
  getPackageNameFromMetadataResponse,
  isPackageInfoUrl,
  modifyNpmInfoRequestHeaders,
  modifyNpmInfoResponse,
} from "./modifyNpmInfo.js";
import { parseNpmPackageUrl } from "./parseNpmPackageUrl.js";
import { openNewPackagesDatabase } from "../../../scanning/newPackagesListCache.js";
import {
  isExcludedFromMinimumPackageAge,
} from "../minimumPackageAgeExclusions.js";

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
    const minimumAgeChecksEnabled = !skipMinimumPackageAge();

    if (await isMalwarePackage(packageName, version)) {
      reqContext.blockMalware(packageName, version);
      return;
    }

    if (minimumAgeChecksEnabled && isPackageInfoUrl(reqContext.targetUrl)) {
      reqContext.modifyRequestHeaders(modifyNpmInfoRequestHeaders);
      reqContext.modifyBody(modifyNpmInfoResponseUnlessExcluded);
      return;
    }

    // For tarball requests the metadata check above is skipped, so we check the
    // new packages list as a fallback (covers e.g. frozen-lockfile installs).
    if (
      minimumAgeChecksEnabled &&
      packageName &&
      version &&
      !isExcludedFromMinimumPackageAge(packageName)
    ) {
      const newPackagesDatabase = await openNewPackagesDatabase();

      if (newPackagesDatabase.isNewlyReleasedPackage(packageName, version)) {
        reqContext.blockMinimumAgeRequest(
          packageName,
          version,
          `Forbidden - blocked by safe-chain direct download minimum package age (${packageName}@${version})`
        );
      }
    }
  });
}

/**
 * @param {Buffer} body
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @returns {Buffer}
 */
function modifyNpmInfoResponseUnlessExcluded(body, headers) {
  const metadataPackageName = getPackageNameFromMetadataResponse(body, headers);

  if (
    metadataPackageName &&
    isExcludedFromMinimumPackageAge(metadataPackageName)
  ) {
    return body;
  }

  return modifyNpmInfoResponse(body, headers);
}
