import { EventEmitter } from "events";
import { ui } from "../../../../environment/userInteraction.js";
import { clearCachingHeaders } from "../../http-utils.js";
import { normalizePipPackageName } from "../../../../scanning/packageNameVariants.js";
import { parsePipPackageFromUrl } from "./parsePipPackageUrl.js";
export { parsePipMetadataUrl, isPipPackageInfoUrl } from "./parsePipPackageUrl.js";
import { getPipMetadataContentType, logSuppressedVersion } from "./pipMetadataResponseUtils.js";
import { modifyPipJsonResponse } from "./modifyPipJsonResponse.js";

/** @type {EventEmitter<{ versionsRemoved: [{packageName: string, packageVersions: string[]}] }>} */
export const modifyPipResponseEventEmitter = new EventEmitter();

/**
 * Strip conditional GET headers so PyPI always returns a full 200 response
 * with a body we can rewrite. Without this, pip sends If-None-Match /
 * If-Modified-Since, PyPI responds 304 Not Modified (empty body), and
 * safe-chain cannot rewrite it — leaving pip with a cached index that still
 * lists too-young versions. Those versions are then blocked at direct-download
 * time with a hard 403, preventing dependency resolution from completing.
 *
 * @param {NodeJS.Dict<string | string[]>} headers
 * @returns {NodeJS.Dict<string | string[]>}
 */
export function modifyPipInfoRequestHeaders(headers) {
  delete headers["if-none-match"];
  delete headers["if-modified-since"];
  return headers;
}

// Match simple-index anchor tags and capture their href so we can suppress
// individual distribution links from PyPI HTML metadata responses.
const HTML_ANCHOR_HREF_RE =
  /<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/a>/gi;

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

    /** @type {{ buffer: Buffer, suppressedVersions: string[] } | undefined} */
    let result;
    if (
      contentType.includes("html") ||
      contentType.includes("application/vnd.pypi.simple.v1+html")
    ) {
      result = modifyHtmlSimpleResponse(
        body,
        headers,
        metadataUrl,
        isNewlyReleasedPackage,
        packageName
      );
    } else if (
      contentType.includes("json") ||
      contentType.includes("application/vnd.pypi.simple.v1+json")
    ) {
      result = modifyJsonResponse(
        body,
        headers,
        metadataUrl,
        isNewlyReleasedPackage,
        packageName
      );
    } else {
      return body;
    }

    if (result.suppressedVersions.length > 0) {
      modifyPipResponseEventEmitter.emit("versionsRemoved", {
        packageName,
        packageVersions: result.suppressedVersions,
      });
    }

    return result.buffer;
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
 * @returns {{ buffer: Buffer, suppressedVersions: string[] }}
 */
function modifyHtmlSimpleResponse(
  body,
  headers,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  const html = body.toString("utf8");
  const suppressedVersions = /** @type {string[]} */ ([]);
  const rewriteHtmlAnchor = createHtmlAnchorRewriter(
    metadataUrl,
    isNewlyReleasedPackage,
    packageName,
    (version) => {
      suppressedVersions.push(version);
    }
  );
  const updatedHtml = html.replace(HTML_ANCHOR_HREF_RE, rewriteHtmlAnchor);

  if (suppressedVersions.length === 0) return { buffer: body, suppressedVersions: [] };
  const modifiedBuffer = Buffer.from(updatedHtml);
  clearCachingHeaders(headers);
  return { buffer: modifiedBuffer, suppressedVersions: [...new Set(suppressedVersions)] };
}

/**
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @param {(version: string) => void} onVersionSuppressed
 * @returns {(anchor: string, quote: string, href: string) => string}
 */
function createHtmlAnchorRewriter(
  metadataUrl,
  isNewlyReleasedPackage,
  packageName,
  onVersionSuppressed
) {
  return (anchor, _quote, href) => {
    const resolvedHref = new URL(href, metadataUrl).toString();
    const { packageName: hrefPackageName, version } = parsePipPackageFromUrl(
      resolvedHref,
      new URL(resolvedHref).host
    );

    if (
      hrefPackageName &&
      normalizePipPackageName(hrefPackageName) ===
        normalizePipPackageName(packageName) &&
      version &&
      isNewlyReleasedPackage(packageName, version)
    ) {
      logSuppressedVersion(packageName, version);
      onVersionSuppressed(version);
      return "";
    }

    return anchor;
  };
}

/**
 * @param {Buffer} body
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {{ buffer: Buffer, suppressedVersions: string[] }}
 */
function modifyJsonResponse(
  body,
  headers,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  const json = JSON.parse(body.toString("utf8"));
  const { suppressedVersions, wasModified } = modifyPipJsonResponse(
    json,
    metadataUrl,
    isNewlyReleasedPackage,
    packageName
  );

  if (!wasModified) return { buffer: body, suppressedVersions: [] };
  const modifiedBuffer = Buffer.from(JSON.stringify(json));
  clearCachingHeaders(headers);
  return { buffer: modifiedBuffer, suppressedVersions };
}
