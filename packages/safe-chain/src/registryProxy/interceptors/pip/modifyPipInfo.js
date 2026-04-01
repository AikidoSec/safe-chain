import { ui } from "../../../environment/userInteraction.js";
import { clearCachingHeaders } from "../../http-utils.js";
import { normalizePipPackageName } from "../../../scanning/packageNameVariants.js";
import { parsePipPackageFromUrl } from "./parsePipPackageUrl.js";
export { parsePipMetadataUrl, isPipPackageInfoUrl } from "./parsePipPackageUrl.js";
import {
  calculateLatestVersion,
  getAvailableVersionsFromJson,
  getPackageVersionFromMetadataFile,
} from "./pipMetadataVersionUtils.js";
import {
  getPipMetadataContentType,
  logSuppressedVersion,
} from "./pipMetadataResponseUtils.js";

/**
 * @param {Buffer} body
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {Buffer}
 */
export function modifyPipInfoResponse(
  body,
  headers,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  try {
    const contentType = getPipMetadataContentType(headers);

    if (!contentType || body.byteLength === 0) {
      return body;
    }

    if (
      contentType.includes("html") ||
      contentType.includes("application/vnd.pypi.simple.v1+html")
    ) {
      return modifyHtmlSimpleResponse(
        body,
        headers,
        metadataUrl,
        isNewlyReleasedPackage,
        packageName
      );
    }

    if (
      contentType.includes("json") ||
      contentType.includes("application/vnd.pypi.simple.v1+json")
    ) {
      return modifyJsonResponse(
        body,
        headers,
        metadataUrl,
        isNewlyReleasedPackage,
        packageName
      );
    }

    return body;
  } catch (/** @type {any} */ err) {
    ui.writeVerbose(
      `Safe-chain: PyPI package metadata not in expected format - bypassing modification. Error: ${err.message}`
    );
    return body;
  }
}

/**
 * @param {Buffer} body
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {Buffer}
 */
function modifyHtmlSimpleResponse(
  body,
  headers,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  const html = body.toString("utf8");
  let modified = false;

  const updatedHtml = html.replace(
    /<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/a>/gi,
    (anchor, _quote, href) => {
      const resolvedHref = new URL(href, metadataUrl).toString();
      const { packageName: hrefPackageName, version } = parsePipPackageFromUrl(
        resolvedHref,
        new URL(resolvedHref).host
      );

      if (
        hrefPackageName &&
        normalizePipPackageName(hrefPackageName) === normalizePipPackageName(packageName) &&
        version &&
        isNewlyReleasedPackage(packageName, version)
      ) {
        modified = true;
        logSuppressedVersion(packageName, version);
        return "";
      }

      return anchor;
    }
  );

  if (!modified) return body;
  const modifiedBuffer = Buffer.from(updatedHtml);
  clearCachingHeaders(headers);
  return modifiedBuffer;
}

/**
 * @param {Buffer} body
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {Buffer}
 */
function modifyJsonResponse(
  body,
  headers,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  const json = JSON.parse(body.toString("utf8"));
  let modified = false;

  if (Array.isArray(json.files)) {
    const filteredFiles = json.files.filter((/** @type {any} */ file) => {
      const version = getPackageVersionFromMetadataFile(file, metadataUrl);

      if (version && isNewlyReleasedPackage(packageName, version)) {
        modified = true;
        logSuppressedVersion(packageName, version);
        return false;
      }

      return true;
    });

    json.files = filteredFiles;
  }

  if (json.releases && typeof json.releases === "object") {
    for (const [version, files] of Object.entries(json.releases)) {
      if (
        Array.isArray(/** @type {unknown[]} */ (files)) &&
        isNewlyReleasedPackage(packageName, version)
      ) {
        delete json.releases[version];
        modified = true;
        logSuppressedVersion(packageName, version);
      }
    }
  }

  if (Array.isArray(json.urls)) {
    json.urls = json.urls.filter((/** @type {any} */ file) => {
      const version = getPackageVersionFromMetadataFile(file, metadataUrl);

      if (version && isNewlyReleasedPackage(packageName, version)) {
        modified = true;
        logSuppressedVersion(packageName, version);
        return false;
      }
      return true;
    });
  }

  if (json.info && typeof json.info === "object") {
    const candidateVersions = getAvailableVersionsFromJson(json, metadataUrl);
    const replacementVersion = calculateLatestVersion(candidateVersions);

    if (
      typeof json.info.version === "string" &&
      replacementVersion &&
      json.info.version !== replacementVersion
    ) {
      json.info.version = replacementVersion;
      modified = true;
    }
  }

  if (!modified) return body;
  const modifiedBuffer = Buffer.from(JSON.stringify(json));
  clearCachingHeaders(headers);
  return modifiedBuffer;
}
