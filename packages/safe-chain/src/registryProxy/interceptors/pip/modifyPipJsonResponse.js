import {
  calculateLatestVersion,
  getAvailableVersionsFromJson,
  getPackageVersionFromMetadataFile,
} from "./pipMetadataVersionUtils.js";
import { logSuppressedVersion } from "./pipMetadataResponseUtils.js";

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {boolean}
 */
export function modifyPipJsonResponse(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  const filesModified = filterJsonMetadataFiles(
    json,
    metadataUrl,
    isNewlyReleasedPackage,
    packageName
  );
  const releasesModified = removeJsonMetadataReleases(
    json,
    isNewlyReleasedPackage,
    packageName
  );
  const urlsModified = filterJsonMetadataUrls(
    json,
    metadataUrl,
    isNewlyReleasedPackage,
    packageName
  );
  const versionModified = updateJsonInfoVersion(json, metadataUrl);

  return filesModified || releasesModified || urlsModified || versionModified;
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {boolean}
 */
function filterJsonMetadataFiles(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  if (!Array.isArray(json.files)) {
    return false;
  }

  let modified = false;
  const loggedVersions = new Set();
  json.files = json.files.filter((/** @type {any} */ file) => {
    const version = getPackageVersionFromMetadataFile(file, metadataUrl);

    if (version && isNewlyReleasedPackage(packageName, version)) {
      modified = true;
      if (!loggedVersions.has(version)) {
        logSuppressedVersion(packageName, version);
        loggedVersions.add(version);
      }
      return false;
    }

    return true;
  });

  return modified;
}

/**
 * @param {any} json
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {boolean}
 */
function removeJsonMetadataReleases(json, isNewlyReleasedPackage, packageName) {
  if (!json.releases || typeof json.releases !== "object") {
    return false;
  }

  let modified = false;

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

  return modified;
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {boolean}
 */
function filterJsonMetadataUrls(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  if (!Array.isArray(json.urls)) {
    return false;
  }

  let modified = false;
  const loggedVersions = new Set();
  json.urls = json.urls.filter((/** @type {any} */ file) => {
    const version = getPackageVersionFromMetadataFile(file, metadataUrl);

    if (version && isNewlyReleasedPackage(packageName, version)) {
      modified = true;
      if (!loggedVersions.has(version)) {
        logSuppressedVersion(packageName, version);
        loggedVersions.add(version);
      }
      return false;
    }

    return true;
  });

  return modified;
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @returns {boolean}
 */
function updateJsonInfoVersion(json, metadataUrl) {
  if (!json.info || typeof json.info !== "object") {
    return false;
  }

  const replacementVersion = computeReplacementVersion(json, metadataUrl);

  if (
    typeof json.info.version !== "string" ||
    !replacementVersion ||
    json.info.version === replacementVersion
  ) {
    return false;
  }

  json.info.version = replacementVersion;
  return true;
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @returns {string | undefined}
 */
function computeReplacementVersion(json, metadataUrl) {
  const candidateVersions = getAvailableVersionsFromJson(json, metadataUrl);
  return calculateLatestVersion(candidateVersions);
}
