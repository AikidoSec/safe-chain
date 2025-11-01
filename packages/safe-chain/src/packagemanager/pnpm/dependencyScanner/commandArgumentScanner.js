import { resolvePackageVersion } from "../../../api/npmApi.js";
import { parsePackagesFromArguments } from "../parsing/parsePackagesFromArguments.js";

/**
 * @returns {import("../../npm/dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner}
 */
export function commandArgumentScanner() {
  return {
    scan: (args) => scanDependencies(args),
    shouldScan: () => true, // There's no dry run for pnpm, so we always scan
  };
}

/**
 * @param {string[]} args
 * @returns {Promise<import("../../npm/dependencyScanner/commandArgumentScanner.js").ScanResult[]>}
 */
async function scanDependencies(args) {
  const changes = [];
  const packageUpdates = parsePackagesFromArguments(args);

  for (const packageUpdate of packageUpdates) {
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
