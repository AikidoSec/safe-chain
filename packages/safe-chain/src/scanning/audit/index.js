import { ui } from "../../environment/userInteraction.js";
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
    const malwarePackage = malwarePackages.find(
      (pkg) => pkg.name === change.name && pkg.version === change.version
    );

    if (malwarePackage) {
      ui.writeVerbose(
        `Safe-chain: Package ${change.name}@${change.version} is marked as malware: ${malwarePackage.status}`
      );
      disallowedChanges.push({ ...change, reason: malwarePackage.status });
    } else {
      ui.writeVerbose(
        `Safe-chain: Package ${change.name}@${change.version} is clean`
      );
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
