import { resolvePackageVersion } from "../../../api/npmApi.js";
import { parsePackagesFromArguments } from "../parsing/parsePackagesFromArguments.js";

/**
 * Store the last audited package versions to ensure npx executes the audited version
 * @type {Map<string, string>}
 */
const auditedVersions = new Map();

/**
 * Get the audited version for a package name
 * @param {string} packageName
 * @returns {string | undefined}
 */
export function getAuditedVersion(packageName) {
  return auditedVersions.get(packageName);
}

/**
 * Clear all audited versions (for testing)
 */
export function clearAuditedVersions() {
  auditedVersions.clear();
}

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
 * @param {string[]} args
 * @returns {Promise<import("../../npm/dependencyScanner/commandArgumentScanner.js").ScanResult[]>}
 */
export async function checkChangesFromArgs(args) {
  // Clear previous audited versions to ensure we only use versions from the current scan
  auditedVersions.clear();
  
  const changes = [];
  const packageUpdates = parsePackagesFromArguments(args);

  for (const packageUpdate of packageUpdates) {
    var exactVersion = await resolvePackageVersion(
      packageUpdate.name,
      packageUpdate.version
    );
    if (exactVersion) {
      packageUpdate.version = exactVersion;
      // Store the audited version so runNpx can pin it
      auditedVersions.set(packageUpdate.name, exactVersion);
    }

    changes.push({ ...packageUpdate, type: "add" });
  }

  return changes;
}
