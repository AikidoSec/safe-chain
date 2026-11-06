/**
 * Detects if a package specification is an external source (not from npm registry).
 * External sources include Git URLs, HTTPS URLs, file paths, etc.
 * 
 * @param {string} packageSpec - The package specification to check
 * @returns {boolean} - True if the package spec is external
 */
export function isExternalPackageSpec(packageSpec) {
  if (!packageSpec || typeof packageSpec !== "string") {
    return false;
  }

  // Git protocols
  if (
    packageSpec.startsWith("git://") ||
    packageSpec.startsWith("git+ssh://") ||
    packageSpec.startsWith("git+https://") ||
    packageSpec.startsWith("git+http://")
  ) {
    return true;
  }

  // Git hosting shortcuts
  if (
    packageSpec.startsWith("github:") ||
    packageSpec.startsWith("gitlab:") ||
    packageSpec.startsWith("bitbucket:")
  ) {
    return true;
  }

  // HTTP(S) URLs
  if (packageSpec.startsWith("https://") || packageSpec.startsWith("http://")) {
    return true;
  }

  // File paths
  if (
    packageSpec.startsWith("file:") ||
    packageSpec.startsWith("./") ||
    packageSpec.startsWith("../") ||
    packageSpec.startsWith("/")
  ) {
    return true;
  }

  return false;
}

/**
 * Validates that a package specification is not external, throwing an error if it is.
 * 
 * @param {string} packageSpec - The package specification to validate
 * @param {string} packageManager - The package manager name (for error message)
 * @throws {Error} If the package specification is external
 */
export function validateNotExternalPackageSpec(packageSpec, packageManager) {
  if (isExternalPackageSpec(packageSpec)) {
    throw new Error(
      `Safe-chain does not support external package specifications for ${packageManager}. ` +
      `The package specification "${packageSpec}" appears to be from a Git repository, ` +
      `HTTPS URL, or file path. Safe-chain can only scan packages from the npm registry. ` +
      `External sources bypass malware scanning and are blocked for security.`
    );
  }
}
