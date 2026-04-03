import { getMinimumPackageAgeHours } from "../../../config/settings.js";
import { ui } from "../../../environment/userInteraction.js";
import { getHeaderValueAsString } from "../../http-utils.js";
import { recordSuppressedVersion } from "../suppressedVersionsState.js";

/**
 * @param {NodeJS.Dict<string | string[]> | undefined} headers
 * @returns {string | undefined}
 */
export function getPipMetadataContentType(headers) {
  return getHeaderValueAsString(headers, "content-type")
    ?.toLowerCase()
    .split(";")[0]
    .trim();
}

/**
 * @param {string} packageName
 * @param {string} version
 * @returns {void}
 */
export function logSuppressedVersion(packageName, version) {
  recordSuppressedVersion();
  ui.writeVerbose(
    `Safe-chain: ${packageName}@${version} is newer than ${getMinimumPackageAgeHours()} hours and was removed (minimumPackageAgeInHours setting).`
  );
}
