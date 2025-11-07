import chalk from "chalk";
import { isMalwarePackage } from "../../scanning/audit/index.js";
import { createInterceptorBuilder } from "./interceptorBuilder.js";

const knownJsRegistries = ["registry.npmjs.org", "registry.yarnpkg.com"];

/**
 * @param {string} url
 * @returns {import("./interceptorBuilder.js").Interceptor | undefined}
 */
export function npmInterceptorForUrl(url) {
  const registry = knownJsRegistries.find((reg) => url.includes(reg));

  if (registry) {
    return buildNpmInterceptor(registry);
  }

  return undefined;
}

/**
 * @param {string} registry
 * @returns {import("./interceptorBuilder.js").Interceptor | undefined}
 */
function buildNpmInterceptor(registry) {
  const builder = createInterceptorBuilder();

  builder.onRequest(async (req) => {
    const { packageName, version } = parseNpmPackageUrl(
      req.targetUrl,
      registry
    );
    if (await isMalwarePackage(packageName, version)) {
      req.blockMalware(packageName, version, req.targetUrl);
    }

    req.modifyRequestHeaders((headers) => {
      if (headers["accept"]?.includes("application/vnd.npm.install-v1+json")) {
        // The npm registry sometimes serves a more compact format that lacks
        // the time metadata we need to filter out too new packages.
        // Force the registry to return the full metadata by changing the Accept header.
        headers["accept"] = "application/json";
      }
    });
  });

  return builder.build();
}

/**
 * @param {string} url
 * @param {string} registry
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
function parseNpmPackageUrl(url, registry) {
  let packageName, version;
  if (!registry || !url.endsWith(".tgz")) {
    return { packageName, version };
  }

  const registryIndex = url.indexOf(registry);
  const afterRegistry = url.substring(registryIndex + registry.length + 1); // +1 to skip the slash

  const separatorIndex = afterRegistry.indexOf("/-/");
  if (separatorIndex === -1) {
    return { packageName, version };
  }

  packageName = afterRegistry.substring(0, separatorIndex);
  const filename = afterRegistry.substring(
    separatorIndex + 3,
    afterRegistry.length - 4
  ); // Remove /-/ and .tgz

  // Extract version from filename
  // For scoped packages like @babel/core, the filename is core-7.21.4.tgz
  // For regular packages like lodash, the filename is lodash-4.17.21.tgz
  if (packageName.startsWith("@")) {
    const scopedPackageName = packageName.substring(
      packageName.lastIndexOf("/") + 1
    );
    if (filename.startsWith(scopedPackageName + "-")) {
      version = filename.substring(scopedPackageName.length + 1);
    }
  } else {
    if (filename.startsWith(packageName + "-")) {
      version = filename.substring(packageName.length + 1);
    }
  }

  return { packageName, version };
}
