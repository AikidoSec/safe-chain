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
      disallowedChanges.push({ ...change, reason: malwarePackage.status });
    } else {
      allowedChanges.push(change);
    }
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
