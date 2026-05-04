import { parsePipPackageFromUrl } from "./parsePipPackageUrl.js";

/**
 * @param {any} file
 * @param {string} metadataUrl
 * @returns {string | undefined}
 */
export function getPackageVersionFromMetadataFile(file, metadataUrl) {
  const href = typeof file?.url === "string" ? file.url : undefined;
  const filename = typeof file?.filename === "string" ? file.filename : undefined;

  if (href) {
    const resolvedHref = new URL(href, metadataUrl).toString();
    return parsePipPackageFromUrl(
      resolvedHref,
      new URL(resolvedHref).host
    ).version;
  }

  if (filename) {
    return parsePipPackageFromUrl(
      new URL(filename, metadataUrl).toString(),
      new URL(metadataUrl).host
    ).version;
  }

  return undefined;
}

/**
 * @param {any} json
 * @param {string} metadataUrl
 * @returns {string[]}
 */
export function getAvailableVersionsFromJson(json, metadataUrl) {
  if (json.releases && typeof json.releases === "object") {
    return Object.keys(json.releases);
  }

  if (!Array.isArray(json.files)) {
    return [];
  }

  return [
    ...new Set(
      json.files
        .map((/** @type {any} */ file) =>
          getPackageVersionFromMetadataFile(file, metadataUrl)
        )
        .filter(isDefinedString)
    ),
  ];
}

/**
 * @param {string | undefined} value
 * @returns {value is string}
 */
function isDefinedString(value) {
  return typeof value === "string";
}

/**
 * @param {string[]} versions
 * @returns {string | undefined}
 */
export function calculateLatestVersion(versions) {
  const stableVersions = versions.filter((version) => !isPrerelease(version));
  if (stableVersions.length > 0) {
    return stableVersions.sort(comparePep440ishVersions).at(-1);
  }

  return versions.sort(comparePep440ishVersions).at(-1);
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function comparePep440ishVersions(left, right) {
  const leftParts = tokenizeVersion(left);
  const rightParts = tokenizeVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;

    if (leftPart === rightPart) {
      continue;
    }

    const leftNumeric = typeof leftPart === "number";
    const rightNumeric = typeof rightPart === "number";

    if (leftNumeric && rightNumeric) {
      return leftPart - rightPart;
    }

    if (leftNumeric) return 1;
    if (rightNumeric) return -1;

    return String(leftPart).localeCompare(String(rightPart));
  }

  return 0;
}

/**
 * @param {string} version
 * @returns {(string | number)[]}
 */
function tokenizeVersion(version) {
  return version
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .flatMap((part) => part.match(/[a-z]+|\d+/g) || [])
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

/**
 * @param {string} version
 * @returns {boolean}
 */
function isPrerelease(version) {
  return /(a|b|rc|dev)\d+/i.test(version);
}
