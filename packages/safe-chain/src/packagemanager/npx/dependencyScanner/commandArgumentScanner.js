import { resolvePackageVersion } from "../../../api/npmApi.js";
import { parsePackagesFromArguments } from "../parsing/parsePackagesFromArguments.js";

/**
 * @returns {import("../../npm/dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner}
 */
export function commandArgumentScanner() {
  return {
    scan: (args) => scanDependencies(args),
    shouldScan: () => true, // all npx commands need to be scanned, npx doesn't have dry-run
  };
}

/**
 * @param {string[]} args
 * @returns {Promise<import("../../npm/dependencyScanner/commandArgumentScanner.js").ScanResult[]>}
 */
function scanDependencies(args) {
  return checkChangesFromArgs(args);
}

/**
 * Checks if a package specification is a non-registry source (URL, Git, file path, etc.)
 * that cannot be validated against the malware database.
 * 
 * @param {string} packageName
 * @returns {boolean}
 */
function isNonRegistryPackageSpec(packageName) {
  // Detect URL protocols (http, https, git, git+https, git+ssh, etc.)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(packageName)) {
    return true;
  }
  
  // Detect Git hosting shortcuts (github:, gitlab:, bitbucket:, gist:)
  if (/^(github|gitlab|bitbucket|gist):/i.test(packageName)) {
    return true;
  }
  
  // Detect file: protocol
  if (/^file:/i.test(packageName)) {
    return true;
  }
  
  // Detect relative paths (./, ../)
  if (/^\.\.?[/\\]/.test(packageName)) {
    return true;
  }
  
  // Detect absolute paths (Unix: /, Windows: C:\, \\)
  if (/^([/\\]|[a-z]:[/\\])/i.test(packageName)) {
    return true;
  }
  
  return false;
}

/**
 * @param {string[]} args
 * @returns {Promise<import("../../npm/dependencyScanner/commandArgumentScanner.js").ScanResult[]>}
 */
export async function checkChangesFromArgs(args) {
  const changes = [];
  const packageUpdates = parsePackagesFromArguments(args);

  for (const packageUpdate of packageUpdates) {
    // Reject non-registry package specifications that bypass malware scanning
    if (isNonRegistryPackageSpec(packageUpdate.name)) {
      throw new Error(
        `Safe-chain: Cannot install package from non-registry source: ${packageUpdate.name}. ` +
        `Only packages from the npm registry can be scanned for malware. ` +
        `Direct URLs, Git repositories, file paths, and tarballs are not supported.`
      );
    }
    
    var exactVersion = await resolvePackageVersion(
      packageUpdate.name,
      packageUpdate.version
    );
    if (exactVersion) {
      packageUpdate.version = exactVersion;
    }

    changes.push({ ...packageUpdate, type: "add" });
  }

  return changes;
}
