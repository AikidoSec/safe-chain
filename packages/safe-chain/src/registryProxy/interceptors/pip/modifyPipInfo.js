import { ui } from "../../../environment/userInteraction.js";
import { clearCachingHeaders } from "../../http-utils.js";
import { normalizePipPackageName } from "../../../scanning/packageNameVariants.js";
import { parsePipPackageFromUrl } from "./parsePipPackageUrl.js";
export { parsePipMetadataUrl, isPipPackageInfoUrl } from "./parsePipPackageUrl.js";
import { getPipMetadataContentType, logSuppressedVersion } from "./pipMetadataResponseUtils.js";
import { modifyPipJsonResponse } from "./modifyPipJsonResponse.js";

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
  const rewriteHtmlAnchor = createHtmlAnchorRewriter(
    metadataUrl,
    isNewlyReleasedPackage,
    packageName,
    () => {
      modified = true;
    }
  );
  const updatedHtml = html.replace(HTML_ANCHOR_HREF_RE, rewriteHtmlAnchor);

  if (!modified) return body;
  const modifiedBuffer = Buffer.from(updatedHtml);
  clearCachingHeaders(headers);
  return modifiedBuffer;
}

/**
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @param {() => void} onModified
 * @returns {(anchor: string, quote: string, href: string) => string}
 */
function createHtmlAnchorRewriter(
  metadataUrl,
  isNewlyReleasedPackage,
  packageName,
  onModified
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
      onModified();
      logSuppressedVersion(packageName, version);
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
  const modified = modifyPipJsonResponse(
    json,
    metadataUrl,
    isNewlyReleasedPackage,
    packageName
  );

  if (!modified) return body;
  const modifiedBuffer = Buffer.from(JSON.stringify(json));
  clearCachingHeaders(headers);
  return modifiedBuffer;
}
