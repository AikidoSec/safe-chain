/**
 * Validates that a package specification is a valid registry package name.
 * Rejects URLs, Git locators, file paths, and tarballs.
 * 
 * @param {string} name - The package name to validate
 * @returns {boolean} - True if valid registry package name, false otherwise
 */
export function isValidRegistryPackageName(name) {
  // Reject HTTP(S) URLs
  if (name.startsWith('http://') || name.startsWith('https://')) {
    return false;
  }
  
  // Reject Git URLs (git://, git+ssh://, git+https://, github:, gitlab:, bitbucket:)
  if (
    name.startsWith('git://') ||
    name.startsWith('git+ssh://') ||
    name.startsWith('git+https://') ||
    name.startsWith('git+http://') ||
    name.startsWith('github:') ||
    name.startsWith('gitlab:') ||
    name.startsWith('bitbucket:')
  ) {
    return false;
  }
  
  // Reject file paths (file:, ./, ../, /)
  if (
    name.startsWith('file:') ||
    name.startsWith('./') ||
    name.startsWith('../') ||
    name.startsWith('/')
  ) {
    return false;
  }
  
  // Reject Windows absolute paths (C:\, D:\, etc.)
  if (/^[a-zA-Z]:[\\\/]/.test(name)) {
    return false;
  }
  
  return true;
}

/**
 * Validates package specifications and throws an error if any are non-registry.
 * 
 * @param {{name: string, version: string}[]} packages - Array of package specifications
 * @throws {Error} - If any package is a non-registry specification
 */
export function validateRegistryPackages(packages) {
  for (const pkg of packages) {
    if (!isValidRegistryPackageName(pkg.name)) {
      throw new Error(
        `Safe-chain: Non-registry package specifications are not supported for security reasons. ` +
        `Package "${pkg.name}" appears to be a URL, Git locator, or file path. ` +
        `Only registry packages can be installed through safe-chain.`
      );
    }
  }
}
