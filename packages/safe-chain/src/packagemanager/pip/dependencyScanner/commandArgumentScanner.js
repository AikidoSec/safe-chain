import { parsePackagesFromInstallArgs } from "../parsing/parsePackagesFromInstallArgs.js";
import { hasDryRunArg } from "../utils/pipCommands.js";

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
 * @param {ScannerOptions} [options]
 *
 * @returns {CommandArgumentScanner}
 */
export function commandArgumentScanner(options = {}) {
  const { ignoreDryRun = false } = options;

  /**
   * @param {string[]} args
   */
  function shouldScan(args) {
    return shouldScanDependencies(args, ignoreDryRun);
  }

  /**
   * @param {string[]} args
   * @returns {Promise<ScanResult[]> | ScanResult[]}
   */
  function scan(args) {
    return scanDependencies(args);
  }

  return {
    shouldScan,
    scan,
  };
}

/**
 * @param {string[]} args
 * @param {boolean} ignoreDryRun
 */
function shouldScanDependencies(args, ignoreDryRun) {
  return ignoreDryRun || !hasDryRunArg(args);
}

/**
 * @param {string[]} args
 * @returns {Promise<ScanResult[]> | ScanResult[]}
 */
function scanDependencies(args) {
  return checkChangesFromArgs(args);
}

/**
 * @param {string[]} args
 * @returns {Promise<ScanResult[]> | ScanResult[]}
 */
export function checkChangesFromArgs(args) {
  const packageUpdates = parsePackagesFromInstallArgs(args);

  // Parser already provides exact versions or "latest", no need to resolve
  // Just return the packages with type "add"
  return packageUpdates;
}
