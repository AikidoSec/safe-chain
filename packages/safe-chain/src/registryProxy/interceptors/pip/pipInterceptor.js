import {
  ECOSYSTEM_PY,
  getPipCustomRegistries,
  skipMinimumPackageAge,
} from "../../../config/settings.js";
import { isMalwarePackage } from "../../../scanning/audit/index.js";
import { getEquivalentPackageNames } from "../../../scanning/packageNameVariants.js";
import { openNewPackagesDatabase } from "../../../scanning/newPackagesListCache.js";
import { interceptRequests } from "../interceptorBuilder.js";
import { isExcludedFromMinimumPackageAge } from "../minimumPackageAgeExclusions.js";
import {
  modifyPipInfoResponse,
  parsePipMetadataUrl,
} from "./modifyPipInfo.js";
import { parsePipPackageFromUrl } from "./parsePipPackageUrl.js";

const knownPipRegistries = [
  "files.pythonhosted.org",
  "pypi.org",
  "pypi.python.org",
  "pythonhosted.org",
];

/**
 * @param {string} url
 * @returns {import("../interceptorBuilder.js").Interceptor | undefined}
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
 * @returns {import("../interceptorBuilder.js").Interceptor | undefined}
 */
function buildPipInterceptor(registry) {
  return interceptRequests(createPipRequestHandler(registry));
}

/**
 * @param {string} registry
 * @returns {(reqContext: import("../interceptorBuilder.js").RequestInterceptionContext) => Promise<void>}
 */
function createPipRequestHandler(registry) {
  return async (reqContext) => {
    const minimumAgeChecksEnabled = !skipMinimumPackageAge();
    const metadataInfo = parsePipMetadataUrl(reqContext.targetUrl);
    const metadataPackageName = metadataInfo.packageName;

    if (
      minimumAgeChecksEnabled &&
      metadataPackageName &&
      !isExcludedFromMinimumPackageAge(metadataPackageName)
    ) {
      const newPackagesDatabase = await openNewPackagesDatabase();
      reqContext.modifyBody((body, headers) =>
        modifyPipInfoResponse(
          body,
          headers,
          reqContext.targetUrl,
          newPackagesDatabase.isNewlyReleasedPackage,
          metadataPackageName
        )
      );
      return;
    }

    const { packageName, version } = parsePipPackageFromUrl(
      reqContext.targetUrl,
      registry
    );

    if (!packageName) {
      return;
    }

    const equivalentPackageNames = getEquivalentPackageNames(
      packageName,
      ECOSYSTEM_PY
    );
    let isMalicious = false;
    for (const equivalentPackageName of equivalentPackageNames) {
      if (await isMalwarePackage(equivalentPackageName, version)) {
        isMalicious = true;
        break;
      }
    }

    if (isMalicious) {
      reqContext.blockMalware(packageName, version);
      return;
    }

    if (
      version &&
      minimumAgeChecksEnabled &&
      !isExcludedFromMinimumPackageAge(packageName)
    ) {
      const newPackagesDatabase = await openNewPackagesDatabase();
      const isNewlyReleased = newPackagesDatabase.isNewlyReleasedPackage(
        packageName,
        version
      );

      if (isNewlyReleased) {
        reqContext.blockMinimumAgeRequest(
          packageName,
          version,
          `Forbidden - blocked by safe-chain direct download minimum package age (${packageName}@${version})`
        );
      }
    }
  };
}
