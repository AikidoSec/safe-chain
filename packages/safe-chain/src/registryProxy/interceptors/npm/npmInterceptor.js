import { skipMinimumPackageAge } from "../../../config/settings.js";
import { isMalwarePackage } from "../../../scanning/audit/index.js";
import { interceptRequests } from "../interceptorBuilder.js";
import {
  isPackageInfoUrl,
  modifyNpmInfoRequestHeaders,
  modifyNpmInfoResponse,
} from "./modifyNpmInfo.js";
import { parseNpmPackageUrl } from "./parseNpmPackageUrl.js";

const knownJsRegistries = ["registry.npmjs.org", "registry.yarnpkg.com"];

/**
 * @returns {string[]}
 */
function getAllowedRegistries() {
  const customRegistries = process.env.SAFE_CHAIN_CUSTOM_NPM_REGISTRIES || "";
  const registries = [...knownJsRegistries];

  if (customRegistries) {
    registries.push(...customRegistries.split(",").map((reg) => reg.trim()));
  }

  return registries;
}

/**
 * @param {string} url
 * @returns {import("../interceptorBuilder.js").Interceptor | undefined}
 */
export function npmInterceptorForUrl(url) {
  const allowedRegistries = getAllowedRegistries();
  const registry = allowedRegistries.find((reg) => url.includes(reg));

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
    }

    if (!skipMinimumPackageAge() && isPackageInfoUrl(reqContext.targetUrl)) {
      reqContext.modifyRequestHeaders(modifyNpmInfoRequestHeaders);
      reqContext.modifyBody(modifyNpmInfoResponse);
    }
  });
}
