import {
  ECOSYSTEM_PY,
  getPipCustomRegistries,
  skipMinimumPackageAge,
} from "../../../config/settings.js";
import { isMalwarePackage } from "../../../scanning/audit/index.js";
import { getEquivalentPackageNames } from "../../../scanning/packageNameVariants.js";
import { interceptRequests } from "../interceptorBuilder.js";
import { openMinimumPackageAgeChecker } from "../minimumPackageAgeChecker.js";
import {
  modifyPipInfoRequestHeaders,
  modifyPipInfoResponse,
  parsePipMetadataUrl,
} from "./modifyPipInfo.js";
import {
  getTestPackageCanonicalName,
  synthesizePipSimpleResponse,
} from "./pipTestPackages.js";
import { parsePipPackageFromUrl } from "./parsePipPackageUrl.js";
import { getHeaderValueAsString } from "../../http-utils.js";
import { ui } from "../../../environment/userInteraction.js";

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

    if (metadataPackageName) {
      const canonical = getTestPackageCanonicalName(metadataPackageName);
      if (canonical) {
        reqContext.setSyntheticResponse(synthesizePipSimpleResponse(canonical));
        return;
      }
    }

    if (minimumAgeChecksEnabled && metadataPackageName) {
      const checker = await openMinimumPackageAgeChecker();

      if (!checker.isPackageExempt(metadataPackageName)) {
        reqContext.modifyRequestHeaders(modifyPipInfoRequestHeaders);
        reqContext.modifyBody((body, headers) =>
          modifyPipInfoResponse(
            body,
            headers,
            reqContext.targetUrl,
            checker.isTooNewByFeed,
            metadataPackageName,
            (packageName, version, uploadTime) =>
              !!uploadTime &&
              checker.isTooNewByReleaseDate(packageName, version, uploadTime)
          )
        );
        return;
      }
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

    if (version && minimumAgeChecksEnabled) {
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

      if (!checker.isPackageExempt(packageName)) {
        reqContext.blockOnResponseHeaders((statusCode, headers) => {
          if (statusCode < 200 || statusCode >= 300) {
            return undefined;
          }

          const lastModified = getHeaderValueAsString(headers, "last-modified");
          if (!lastModified || Number.isNaN(new Date(lastModified).getTime())) {
            ui.writeVerbose(
              `Safe-chain: Missing or invalid Last-Modified for ${packageName}@${version} at ${reqContext.targetUrl}, allowing download`
            );
            return undefined;
          }

          if (checker.isTooNewByReleaseDate(packageName, version, lastModified)) {
            return {
              packageName,
              version,
              message: `Forbidden - blocked by safe-chain direct download minimum package age (${packageName}@${version})`,
            };
          }

          return undefined;
        });
      }
    }
  };
}
