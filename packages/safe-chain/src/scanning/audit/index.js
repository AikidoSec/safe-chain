import {
  MALWARE_STATUS_MALWARE,
  openMalwareDatabase,
} from "../malwareDatabase.js";

export async function auditChanges(changes) {
  const allowedChanges = [];
  const disallowedChanges = [];

  var malwarePackages = await getPackagesWithMalware(
    changes.filter(
      (change) => change.type === "add" || change.type === "change"
    )
  );

  for (const change of changes) {
    //Uncomment next line during manual testing
    //console.log(" Safe-chain: auditing package:", change);
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
