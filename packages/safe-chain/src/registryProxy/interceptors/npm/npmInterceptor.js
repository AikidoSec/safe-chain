import { getMinimumPackageAgeHours } from "../../../config/settings.js";
import { isMalwarePackage } from "../../../scanning/audit/index.js";
import { interceptRequests } from "../interceptorBuilder.js";
import { ui } from "../../../environment/userInteraction.js";

const knownJsRegistries = ["registry.npmjs.org", "registry.yarnpkg.com"];

/**
 * @param {string} url
 * @returns {import("../interceptorBuilder.js").Interceptor | undefined}
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

    if (isPackageInfoUrl(reqContext.targetUrl)) {
      reqContext.modifyRequestHeaders((headers) => {
        if (
          headers["accept"]?.includes("application/vnd.npm.install-v1+json")
        ) {
          // The npm registry sometimes serves a more compact format that lacks
          // the time metadata we need to filter out too new packages.
          // Force the registry to return the full metadata by changing the Accept header.
          headers["accept"] = "application/json";
        }
      });

      reqContext.modifyResponse((res) => {
        res.modifyBody(modifyNpmInfoRequestBody);
      });
    }
  });
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

/**
 * @param {string} url
 * @returns {boolean}
 */
function isPackageInfoUrl(url) {
  // Remove query string and fragment to get the actual path
  const urlWithoutParams = url.split("?")[0].split("#")[0];

  // Tarball downloads end with .tgz
  if (urlWithoutParams.endsWith(".tgz")) return false;

  // Special endpoints start with /-/ and should not be modified
  // Examples: /-/npm/v1/security/advisories/bulk, /-/v1/search, /-/package/foo/access
  if (urlWithoutParams.includes("/-/")) return false;

  // Everything else is package metadata that can be modified
  return true;
}

/**
 *
 * @param {Buffer} body
 * @returns Buffer
 */
function modifyNpmInfoRequestBody(body) {
  try {
    const bodyContent = body.toString("utf8");
    const bodyJson = JSON.parse(bodyContent);

    if (!bodyJson.time || !bodyJson["dist-tags"] || !bodyJson.versions) {
      // Just return the body if the
      return body;
    }

    const cutOff = new Date(
      new Date().getTime() - getMinimumPackageAgeHours() * 3600 * 1000
    ).toISOString();

    const hasLatestTag = !!bodyJson["dist-tags"]["latest"];

    const versions = Object.entries(bodyJson.time)
      .map(([version, timestamp]) => ({
        version,
        timestamp,
      }))
      .filter((x) => x.version != "created" && x.version != "modified");

    for (const { version, timestamp } of versions) {
      if (version === "created" || version === "modified") {
        continue;
      }

      if (timestamp > cutOff) {
        deleteVersionFromJson(bodyJson, version);
        continue;
      }
    }

    if (hasLatestTag && !bodyJson["dist-tags"]["latest"]) {
      // The latest tag was removed because it contained a package younger than the treshold.
      // A new latest tag needs to be calculated
      bodyJson["dist-tags"]["latest"] = calculateLatestTag(bodyJson);
    }

    return Buffer.from(JSON.stringify(bodyJson));
  } catch (err) {
    // TODO: better error handling
    return body;
  }
}

function deleteVersionFromJson(json, version) {
  ui.writeVerbose(
    `Safe-chain: Deleting ${version} from npm info request, it's newer than the minimumPackageAgeInHours`
  );

  delete json.time[version];
  delete json.versions[version];

  for (const [tag, distVersion] of Object.entries(json["dist-tags"])) {
    if (version == distVersion) {
      delete json["dist-tags"][tag];
    }
  }
}

function calculateLatestTag(json) {
  if (!json.time) {
    return undefined;
  }

  let latest, preview, latestDate, previewDate;

  for (const [version, timestamp] of Object.entries(json.time)) {
    if (version == "created" || version == "modified") continue;

    if (version.includes("-")) {
      // preview versions include "-" in the name
      [preview, previewDate] = getLatest(
        preview,
        previewDate,
        version,
        timestamp
      );
    } else {
      [latest, latestDate] = getLatest(latest, latestDate, version, timestamp);
    }
  }

  if (latest) {
    return latest;
  } else {
    return preview;
  }

  function getLatest(currentLatest, currentLatestDate, version, timestamp) {
    if (!currentLatest) {
      return [version, timestamp];
    }

    if (timestamp > currentLatestDate) {
      return [version, timestamp];
    }

    return [currentLatest, currentLatestDate];
  }
}
