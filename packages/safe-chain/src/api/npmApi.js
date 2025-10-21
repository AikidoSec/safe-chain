import * as semver from "semver";
import * as npmFetch from "npm-registry-fetch";

export async function resolvePackageVersion(packageName, versionRange) {
  if (!versionRange) {
    versionRange = "latest";
  }

  if (semver.valid(versionRange)) {
    // The version is a fixed version, no need to resolve
    return versionRange;
  }

  const packageInfo = await getPackageInfo(packageName);
  if (!packageInfo) {
    // It is possible that no version is found (could be a private package, or a package that doesn't exist)
    // In this case, we return null to indicate that we couldn't resolve the version
    return null;
  }

  const distTags = packageInfo["dist-tags"];
  if (distTags && distTags[versionRange]) {
    // If the version range is a dist-tag, return the version associated with that tag
    // e.g., "latest", "next", etc.
    return distTags[versionRange];
  }

  if (!packageInfo.versions) {
    return null;
  }

  // If the version range is not a dist-tag, we need to resolve the highest version matching the range.
  // This is useful for ranges like "^1.0.0" or "~2.3.4".
  const availableVersions = Object.keys(packageInfo.versions);
  const resolvedVersion = semver.maxSatisfying(availableVersions, versionRange);
  if (resolvedVersion) {
    return resolvedVersion;
  }

  // Nothing matched the range, return null
  return null;
}

async function getPackageInfo(packageName) {
  try {
    return await npmFetch.json(packageName);
  } catch {
    return null;
  }
}
