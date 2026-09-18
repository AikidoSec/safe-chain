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
  // A safe patch entry only certifies the artifact Aikido inspected on the
  // known public registry - a custom/private registry can serve a different,
  // unvetted artifact under the exact same name+version, so the exemption must
  // never apply there. See minimumPackageAgeChecker.js.
  const allowSafePatches = knownPipRegistries.includes(registry);

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
      const checker = await openMinimumPackageAgeChecker({ allowSafePatches });

      if (!checker.isPackageExempt(metadataPackageName)) {
        reqContext.modifyRequestHeaders(modifyPipInfoRequestHeaders);
        reqContext.modifyBody((body, headers) =>
          modifyPipInfoResponse(
            body,
            headers,
            reqContext.targetUrl,
            checker.isTooNewByFeed,
            metadataPackageName
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
      const checker = await openMinimumPackageAgeChecker({ allowSafePatches });

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
  };
}
