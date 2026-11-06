import { resolvePackageVersion } from "../../../api/npmApi.js";
import { parsePackagesFromInstallArgs } from "../parsing/parsePackagesFromInstallArgs.js";
import { hasDryRunArg } from "../utils/npmCommands.js";

/**
 * @typedef {Object} ScanResult
 * @property {string} name
 * @property {string} version
 * @property {string} type
 */

/**
 * @typedef {Object} ScannerOptions
 * @property {boolean} [ignoreDryRun]
 */

/**
 * @typedef {Object} CommandArgumentScanner
 * @property {(args: string[]) => Promise<ScanResult[]> | ScanResult[]} scan
 * @property {(args: string[]) => boolean} shouldScan
 */

/**
 * @param {ScannerOptions} [opts]
 *
 * @returns {CommandArgumentScanner}
 */
export function commandArgumentScanner(opts) {
  const ignoreDryRun = opts?.ignoreDryRun ?? false;

  return {
    scan: (args) => scanDependencies(args),
    shouldScan: (args) => shouldScanDependencies(args, ignoreDryRun),
  };
}

/**
 * @param {string[]} args
 * @returns {Promise<ScanResult[]>}
 */
function scanDependencies(args) {
  return checkChangesFromArgs(args);
}

/**
 * @param {string[]} args
 * @param {boolean} ignoreDryRun
 * @returns {boolean}
 */
function shouldScanDependencies(args, ignoreDryRun) {
  return ignoreDryRun || !hasDryRunArg(args);
}

/**
 * Validates that a package specification is a valid npm registry package.
 * Rejects URLs, Git URLs, file paths, GitHub shortcuts, and other non-registry specifications.
 * 
 * @param {string} packageName
 * @returns {boolean}
 */
function isValidNpmRegistryPackage(packageName) {
  // Reject URLs (http://, https://, file:)
  if (/^(https?|file):/.test(packageName)) {
    return false;
  }
  
  // Reject Git URLs (git://, git+ssh://, git+https://)
  if (/^git(\+|:)/.test(packageName)) {
    return false;
  }
  
  // Reject GitHub shortcuts (user/repo, github:user/repo, gitlab:user/repo, bitbucket:user/repo)
  if (/^(github|gitlab|bitbucket):/.test(packageName)) {
    return false;
  }
  
  // Reject GitHub shorthand format (user/repo) but allow scoped packages (@scope/package)
  // GitHub shorthand: contains a slash but doesn't start with @
  if (!packageName.startsWith("@") && packageName.includes("/")) {
    return false;
  }
  
  // Reject file paths (relative or absolute)
  // Paths starting with ./, ../, /, ~/, or Windows-style paths
  if (/^(\.{1,2}\/|\/|~\/|[a-zA-Z]:\\)/.test(packageName)) {
    return false;
  }
  
  // Reject other protocol-based specifications
  if (/^[a-z][a-z0-9+.-]*:/.test(packageName)) {
    return false;
  }
  
  return true;
}

/**
 * @param {string[]} args
 * @returns {Promise<ScanResult[]>}
 */
export async function checkChangesFromArgs(args) {
  const changes = [];
  const packageUpdates = parsePackagesFromInstallArgs(args);

  for (const packageUpdate of packageUpdates) {
    // Validate that the package specification is a valid npm registry package
    if (!isValidNpmRegistryPackage(packageUpdate.name)) {
      throw new Error(
        `Safe-chain: npm package specification "${packageUpdate.name}" is not a valid npm registry package. ` +
        `URLs, Git repositories, file paths, and other non-registry specifications are not supported by Safe Chain's malware protection.`
      );
    }
    
    var exactVersion = await resolvePackageVersion(
      packageUpdate.name,
      packageUpdate.version
    );
    if (exactVersion) {
      packageUpdate.version = exactVersion;
    } else {
      // If we cannot resolve the version from the registry, reject the package
      // This prevents bypassing malware checks with packages that don't exist in the registry
      throw new Error(
        `Safe-chain: Unable to resolve package "${packageUpdate.name}@${packageUpdate.version}" from npm registry. ` +
        `This may be a private package, a non-existent package, or a network issue. ` +
        `Safe Chain requires registry resolution to verify packages against the malware database.`
      );
    }

    changes.push({ ...packageUpdate, type: "add" });
  }
  return changes;
}
