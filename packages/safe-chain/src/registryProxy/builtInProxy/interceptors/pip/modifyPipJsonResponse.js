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
 * @returns {{ suppressedVersions: string[], wasModified: boolean }}
 */
export function modifyPipJsonResponse(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  const filesSuppressed = filterJsonMetadataFiles(
    json,
    metadataUrl,
    isNewlyReleasedPackage,
    packageName
  );
  const releasesSuppressed = removeJsonMetadataReleases(
    json,
    isNewlyReleasedPackage,
    packageName
  );
  const urlsSuppressed = filterJsonMetadataUrls(
    json,
    metadataUrl,
    isNewlyReleasedPackage,
    packageName
  );
  const versionModified = updateJsonInfoVersion(json, metadataUrl);

  const suppressedVersions = [
    ...new Set([...filesSuppressed, ...releasesSuppressed, ...urlsSuppressed]),
  ];

  return { suppressedVersions, wasModified: suppressedVersions.length > 0 || versionModified };
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {string[]}
 */
function filterJsonMetadataFiles(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  if (!Array.isArray(json.files)) {
    return [];
  }

  const suppressed = new Set();
  json.files = json.files.filter((/** @type {any} */ file) => {
    const version = getPackageVersionFromMetadataFile(file, metadataUrl);

    if (version && isNewlyReleasedPackage(packageName, version)) {
      if (!suppressed.has(version)) {
        logSuppressedVersion(packageName, version);
        suppressed.add(version);
      }
      return false;
    }

    return true;
  });

  return [...suppressed];
}

/**
 * @param {any} json
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {string[]}
 */
function removeJsonMetadataReleases(json, isNewlyReleasedPackage, packageName) {
  if (!json.releases || typeof json.releases !== "object") {
    return [];
  }

  const suppressed = [];

  for (const [version, files] of Object.entries(json.releases)) {
    if (
      Array.isArray(/** @type {unknown[]} */ (files)) &&
      isNewlyReleasedPackage(packageName, version)
    ) {
      delete json.releases[version];
      logSuppressedVersion(packageName, version);
      suppressed.push(version);
    }
  }

  return suppressed;
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @returns {string[]}
 */
function filterJsonMetadataUrls(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName
) {
  if (!Array.isArray(json.urls)) {
    return [];
  }

  const suppressed = new Set();
  json.urls = json.urls.filter((/** @type {any} */ file) => {
    const version = getPackageVersionFromMetadataFile(file, metadataUrl);

    if (version && isNewlyReleasedPackage(packageName, version)) {
      if (!suppressed.has(version)) {
        logSuppressedVersion(packageName, version);
        suppressed.add(version);
      }
      return false;
    }

    return true;
  });

  return [...suppressed];
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
