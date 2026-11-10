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
 * @param {(packageName: string, version: string, uploadTime: string | undefined) => boolean} [isFileTooNew]
 * @returns {boolean}
 */
export function modifyPipJsonResponse(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName,
  isFileTooNew = () => false
) {
  const loggedVersions = new Set();
  /** @param {string} version */
  const logVersion = (version) => {
    if (!loggedVersions.has(version)) {
      logSuppressedVersion(packageName, version);
      loggedVersions.add(version);
    }
  };
  const filesModified = filterJsonMetadataFiles(
    json,
    metadataUrl,
    isNewlyReleasedPackage,
    packageName,
    isFileTooNew,
    logVersion
  );
  const releasesModified = removeJsonMetadataReleases(
    json,
    isNewlyReleasedPackage,
    packageName,
    isFileTooNew,
    logVersion
  );
  const urlsModified = filterJsonMetadataUrls(
    json,
    metadataUrl,
    isNewlyReleasedPackage,
    packageName,
    isFileTooNew,
    logVersion
  );
  const versionModified = updateJsonInfoVersion(json, metadataUrl);

  return filesModified || releasesModified || urlsModified || versionModified;
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @param {(packageName: string, version: string, uploadTime: string | undefined) => boolean} isFileTooNew
 * @param {(version: string) => void} logVersion
 * @returns {boolean}
 */
function filterJsonMetadataFiles(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName,
  isFileTooNew,
  logVersion
) {
  if (!Array.isArray(json.files)) {
    return false;
  }

  let modified = false;
  const originalVersions = new Set();
  const remainingVersions = new Set();
  json.files = json.files.filter((/** @type {any} */ file) => {
    const version = getPackageVersionFromMetadataFile(file, metadataUrl);
    if (version) originalVersions.add(version);

    if (version && (
      isNewlyReleasedPackage(packageName, version) ||
      isFileTooNew(packageName, version, file["upload-time"])
    )) {
      modified = true;
      logVersion(version);
      return false;
    }

    if (version) remainingVersions.add(version);
    return true;
  });

  if (modified && Array.isArray(json.versions)) {
    json.versions = json.versions.filter((/** @type {string} */ version) =>
      !originalVersions.has(version) || remainingVersions.has(version)
    );
  }

  return modified;
}

/**
 * @param {any} json
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @param {(packageName: string, version: string, uploadTime: string | undefined) => boolean} isFileTooNew
 * @param {(version: string) => void} logVersion
 * @returns {boolean}
 */
function removeJsonMetadataReleases(json, isNewlyReleasedPackage, packageName, isFileTooNew, logVersion) {
  if (!json.releases || typeof json.releases !== "object") {
    return false;
  }

  let modified = false;

  for (const [version, files] of Object.entries(json.releases)) {
    if (!Array.isArray(files)) continue;

    if (isNewlyReleasedPackage(packageName, version)) {
      delete json.releases[version];
      modified = true;
      logVersion(version);
      continue;
    }

    const remainingFiles = files.filter((file) =>
      !isFileTooNew(packageName, version, file.upload_time_iso_8601 ?? file.upload_time)
    );
    if (remainingFiles.length !== files.length) {
      modified = true;
      logVersion(version);
      if (remainingFiles.length === 0) {
        delete json.releases[version];
      } else {
        json.releases[version] = remainingFiles;
      }
    }
  }

  return modified;
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @param {(packageName: string | undefined, version: string | undefined) => boolean} isNewlyReleasedPackage
 * @param {string} packageName
 * @param {(packageName: string, version: string, uploadTime: string | undefined) => boolean} isFileTooNew
 * @param {(version: string) => void} logVersion
 * @returns {boolean}
 */
function filterJsonMetadataUrls(
  json,
  metadataUrl,
  isNewlyReleasedPackage,
  packageName,
  isFileTooNew,
  logVersion
) {
  if (!Array.isArray(json.urls)) {
    return false;
  }

  let modified = false;
  json.urls = json.urls.filter((/** @type {any} */ file) => {
    const version = getPackageVersionFromMetadataFile(file, metadataUrl);

    if (version && (
      isNewlyReleasedPackage(packageName, version) ||
      isFileTooNew(packageName, version, file.upload_time_iso_8601 ?? file.upload_time)
    )) {
      modified = true;
      logVersion(version);
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
