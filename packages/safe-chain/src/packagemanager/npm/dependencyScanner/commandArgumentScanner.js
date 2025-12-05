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
 * @param {string[]} args
 * @returns {Promise<ScanResult[]>}
 */
export async function checkChangesFromArgs(args) {
  const changes = [];
  const packageUpdates = parsePackagesFromInstallArgs(args);

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
