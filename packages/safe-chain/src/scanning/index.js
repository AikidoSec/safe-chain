import { auditChanges } from "./audit/index.js";
import { getScanTimeout } from "../config/configFile.js";
import { setTimeout } from "timers/promises";
import chalk from "chalk";
import { getPackageManager } from "../packagemanager/currentPackageManager.js";
import { ui } from "../environment/userInteraction.js";

/**
 * @param {string[]} args
 *
 * @returns {boolean}
 */
export function shouldScanCommand(args) {
  if (!args || args.length === 0) {
    return false;
  }

  return getPackageManager().isSupportedCommand(args);
}

/**
 * @param {string[]} args
 *
 * @returns {Promise<number>}
 */
export async function scanCommand(args) {
  if (!shouldScanCommand(args)) {
    return 0;
  }

  let timedOut = false;
  /** @type {import("./audit/index.js").AuditResult | undefined} */
  let audit;

  await Promise.race([
    (async () => {
      const packageManager = getPackageManager();
      const changes = await packageManager.getDependencyUpdatesForCommand(args);

      if (timedOut) {
        return;
      }

      audit = await auditChanges(changes);
    })(),
    setTimeout(getScanTimeout()).then(() => {
      timedOut = true;
    }),
  ]);

  if (timedOut) {
    throw new Error("Timeout exceeded while scanning npm install command.");
  }

  if (!audit || audit.isAllowed) {
    return 0;
  } else {
    printMaliciousChanges(audit.disallowedChanges);
    onMalwareFound();
    return 1;
  }
}

/**
 * @param {import("./audit/index.js").PackageChange[]} changes
 * @return {void}
 */
function printMaliciousChanges(changes) {
  ui.writeInformation(
    chalk.red("✖") + " Safe-chain: " + chalk.bold("Malicious changes detected:")
  );

  for (const change of changes) {
    ui.writeInformation(` - ${change.name}@${change.version}`);
  }
}

function onMalwareFound() {
  ui.emptyLine();
  ui.writeExitWithoutInstallingMaliciousPackages();
  ui.emptyLine();
}
