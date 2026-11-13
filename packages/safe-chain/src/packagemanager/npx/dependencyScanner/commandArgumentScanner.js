import { resolvePackageVersion } from "../../../api/npmApi.js";
import { parsePackagesFromArguments } from "../parsing/parsePackagesFromArguments.js";
import { validateNotExternalPackageSpec } from "../../_shared/externalPackageSpec.js";

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
  const changes = [];
  const packageUpdates = parsePackagesFromArguments(args);

  for (const packageUpdate of packageUpdates) {
    // Reject external package specifications (Git, HTTPS, file paths, etc.)
    validateNotExternalPackageSpec(packageUpdate.name, "npx");

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
