import {
  getPipCustomRegistries,
  skipMinimumPackageAge,
} from "../../../config/settings.js";
import { isMalwarePackage } from "../../../scanning/audit/index.js";
import { openNewPackagesDatabase } from "../../../scanning/newPackagesListCache.js";
import { interceptRequests } from "../interceptorBuilder.js";
import { isExcludedFromMinimumPackageAge } from "../minimumPackageAgeExclusions.js";
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
    const { packageName, version } = parsePipPackageFromUrl(
      reqContext.targetUrl,
      registry
    );

    // PyPI treats hyphens and underscores as equivalent distribution names.
    const hyphenName = packageName?.includes("_")
      ? packageName.replace(/_/g, "-")
      : packageName;

    const isMalicious =
      await isMalwarePackage(packageName, version) ||
      await isMalwarePackage(hyphenName, version);

    if (isMalicious) {
      reqContext.blockMalware(packageName, version);
      return;
    }

    if (
      packageName &&
      version &&
      !skipMinimumPackageAge() &&
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
