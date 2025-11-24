import { getMinimumPackageAgeHours } from "../../../config/settings.js";
import { ui } from "../../../environment/userInteraction.js";
import { getHeaderValueAsString } from "../../http-utils.js";

const state = {
  hasSuppressedVersions: false,
};

/**
 * @param {NodeJS.Dict<string | string[]>} headers
 * @returns {NodeJS.Dict<string | string[]>}
 */
export function modifyNpmInfoRequestHeaders(headers) {
  const accept = getHeaderValueAsString(headers, "accept");
  if (accept?.includes("application/vnd.npm.install-v1+json")) {
    // The npm registry sometimes serves a more compact format that lacks
    // the time metadata we need to filter out too new packages.
    // Force the registry to return the full metadata by changing the Accept header.
    headers["accept"] = "application/json";
  }
  return headers;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isPackageInfoUrl(url) {
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
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @returns Buffer
 */
export function modifyNpmInfoResponse(body, headers) {
  try {
    const contentType = getHeaderValueAsString(headers, "content-type");
    if (!contentType?.toLowerCase().includes("application/json")) {
      return body;
    }

    if (body.byteLength === 0) {
      return body;
    }

    // utf-8 is default encoding for JSON, so we don't check if charset is defined in content-type header
    const bodyContent = body.toString("utf8");
    const bodyJson = JSON.parse(bodyContent);

    if (!bodyJson.time || !bodyJson["dist-tags"] || !bodyJson.versions) {
      // Just return the current body if the format is not
      return body;
    }

    const cutOff = new Date(
      new Date().getTime() - getMinimumPackageAgeHours() * 3600 * 1000
    );

    const hasLatestTag = !!bodyJson["dist-tags"]["latest"];

    const versions = Object.entries(bodyJson.time)
      .map(([version, timestamp]) => ({
        version,
        timestamp,
      }))
      .filter((x) => x.version !== "created" && x.version !== "modified");

    for (const { version, timestamp } of versions) {
      const timestampValue = new Date(timestamp);
      if (timestampValue > cutOff) {
        deleteVersionFromJson(bodyJson, version);
        if (headers) {
          // When modifying the response, the etag and last-modified headers
          // no longer match the content so they needs to be removed before sending the response.
          delete headers["etag"];
          delete headers["last-modified"];
          // Removing the cache-control header will prevent the package manager from caching
          // the modified response.
          delete headers["cache-control"];
        }
      }
    }

    if (hasLatestTag && !bodyJson["dist-tags"]["latest"]) {
      // The latest tag was removed because it contained a package younger than the treshold.
      // A new latest tag needs to be calculated
      bodyJson["dist-tags"]["latest"] = calculateLatestTag(bodyJson.time);
    }

    return Buffer.from(JSON.stringify(bodyJson));
  } catch (/** @type {any} */ err) {
    ui.writeVerbose(
      `Safe-chain: Package metadata not in expected format - bypassing modification. Error: ${err.message}`
    );
    return body;
  }
}

/**
 * @param {any} json
 * @param {string} version
 */
function deleteVersionFromJson(json, version) {
  state.hasSuppressedVersions = true;

  ui.writeVerbose(
    `Safe-chain: ${version} is newer than ${getMinimumPackageAgeHours()} hours and was removed (minimumPackageAgeInHours setting).`
  );

  delete json.time[version];
  delete json.versions[version];

  for (const [tag, distVersion] of Object.entries(json["dist-tags"])) {
    if (version == distVersion) {
      delete json["dist-tags"][tag];
    }
  }
}

/**
 * @param {Record<string, string>} tagList
 * @returns {string | undefined}
 */
function calculateLatestTag(tagList) {
  const entries = Object.entries(tagList).filter(
    ([version, _]) => version !== "created" && version !== "modified"
  );

  const latestFullRelease = getMostRecentTag(
    Object.fromEntries(entries.filter(([version, _]) => !version.includes("-")))
  );
  if (latestFullRelease) {
    return latestFullRelease;
  }

  const latestPrerelease = getMostRecentTag(
    Object.fromEntries(entries.filter(([version, _]) => version.includes("-")))
  );
  return latestPrerelease;
}

/**
 * @param {Record<string, string>} tagList
 * @returns {string | undefined}
 */
function getMostRecentTag(tagList) {
  let current, currentDate;

  for (const [version, timestamp] of Object.entries(tagList)) {
    if (!currentDate || currentDate < timestamp) {
      current = version;
      currentDate = timestamp;
    }
  }

  return current;
}

/**
 * @returns {boolean}
 */
export function getHasSuppressedVersions() {
  return state.hasSuppressedVersions;
}
