import { ui } from "../../environment/userInteraction.js";
import {
  MALWARE_STATUS_MALWARE,
  openMalwareDatabase,
} from "../malwareDatabase.js";

/**
 * @typedef {Object} PackageChange
 * @property {string} name
 * @property {string} version
 * @property {string} type
 */

/**
 * @typedef {Object} AuditResult
 * @property {PackageChange[]} allowedChanges
 * @property {(PackageChange & {reason: string})[]} disallowedChanges
 * @property {boolean} isAllowed
 */

/**
 * @typedef {Object} AuditStats
 * @property {number} totalPackages
 * @property {number} safePackages
 * @property {number} malwarePackages
 */

/**
 * @type AuditStats
 */
const auditStats = {
  totalPackages: 0,
  safePackages: 0,
  malwarePackages: 0,
};

/**
 * @returns {AuditStats}
 */
export function getAuditStats() {
  return auditStats;
}

/**
 *
 * @param {string | undefined} name
 * @param {string | undefined} version
 * @returns {Promise<boolean>}
 */
export async function isMalwarePackage(name, version) {
  if (!name || !version) {
    return false;
  }

  const auditResult = await auditChanges([{ name, version, type: "add" }]);

  return !auditResult.isAllowed;
}

/**
 * @param {PackageChange[]} changes
 *
 * @returns {Promise<AuditResult>}
 */
export async function auditChanges(changes) {
  const allowedChanges = [];
  const disallowedChanges = [];

  var malwarePackages = await getPackagesWithMalware(
    changes.filter(
      (change) => change.type === "add" || change.type === "change"
    )
  );

  for (const change of changes) {
    const malwarePackage = malwarePackages.find(
      (pkg) => pkg.name === change.name && pkg.version === change.version
    );

    if (malwarePackage) {
      auditStats.malwarePackages += 1;
      ui.writeVerbose(
        `Safe-chain: Package ${change.name}@${change.version} is marked as malware: ${malwarePackage.status}`
      );
      disallowedChanges.push({ ...change, reason: malwarePackage.status });
    } else {
      auditStats.safePackages += 1;
      ui.writeVerbose(
        `Safe-chain: Package ${change.name}@${change.version} is clean`
      );
      allowedChanges.push(change);
    }

    auditStats.totalPackages += 1;
  }

  const auditResults = {
    allowedChanges,
    disallowedChanges,
    isAllowed: disallowedChanges.length === 0,
  };

  return auditResults;
}

/**
 * @param {{name: string, version: string, type: string}[]} changes
 * @returns {Promise<{name: string, version: string, status: string}[]>}
 */
async function getPackagesWithMalware(changes) {
  if (changes.length === 0) {
    return [];
  }

  const malwareDb = await openMalwareDatabase();
  let allVulnerablePackages = [];

  for (const change of changes) {
    if (malwareDb.isMalware(change.name, change.version)) {
      allVulnerablePackages.push({
        name: change.name,
        version: change.version,
        status: MALWARE_STATUS_MALWARE,
      });
    }
  }

  return allVulnerablePackages;
}
