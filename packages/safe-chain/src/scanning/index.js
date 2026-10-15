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
  /** @type {import("./audit/index.js").PackageChange[]} */
  let changes = [];

  await Promise.race([
    (async () => {
      const packageManager = getPackageManager();
      changes = await packageManager.getDependencyUpdatesForCommand(args);

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

  // Reject commands that are marked as scannable but produce no explicit package operands.
  // Such commands may install dependencies from manifests, lockfiles, or caches without audit.
  if (changes.length === 0) {
    ui.writeInformation(
      chalk.red("✖") + " Safe-chain: " + chalk.bold("Command blocked: no explicit packages to audit")
    );
    ui.emptyLine();
    ui.writeInformation(
      "This command would install packages without explicit operands, bypassing malware scanning."
    );
    ui.writeInformation(
      "Please specify explicit package names and versions to install, or use a package manager command that does not install dependencies."
    );
    ui.emptyLine();
    return 1;
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
