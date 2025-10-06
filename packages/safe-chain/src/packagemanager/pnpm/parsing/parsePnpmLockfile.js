import yaml from "js-yaml";

export function parsePnpmLockfile(lockfileContent) {
  try {
    const lockfile = yaml.load(lockfileContent);
    const packages = [];

    // Extract packages from the lockfile
    if (lockfile && lockfile.packages) {
      for (const [packagePath, packageInfo] of Object.entries(lockfile.packages)) {
        // Skip root package
        if (packagePath === "") {
          continue;
        }

        // Extract package name and version from the path
        const packageDetails = parsePackagePath(packagePath, packageInfo);
        if (packageDetails) {
          packages.push(packageDetails);
        }
      }
    }

    return packages;
  } catch (error) {
    throw new Error(`Failed to parse pnpm lockfile: ${error.message}`);
  }
}

function parsePackagePath(packagePath, packageInfo) {
  // Package path format: /package-name/version or /@scope/package-name/version
  const pathParts = packagePath.split("/").filter(part => part !== "");
  
  if (pathParts.length < 2) {
    return null;
  }

  let name, version;
  
  if (pathParts[0].startsWith("@")) {
    // Scoped package: /@scope/package-name/version
    if (pathParts.length < 3) {
      return null;
    }
    name = `@${pathParts[0].substring(1)}/${pathParts[1]}`;
    version = pathParts[2];
  } else {
    // Regular package: /package-name/version
    name = pathParts[0];
    version = pathParts[1];
  }

  // Get the resolved version from package info if available
  const resolvedVersion = packageInfo.version || version;

  return {
    name,
    version: resolvedVersion,
    type: "add" // All packages in lockfile are considered as "add" operations
  };
}
