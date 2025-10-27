import { auditChanges } from "./audit/index.js";
import { getScanTimeout } from "../config/configFile.js";
import { setTimeout } from "timers/promises";
import chalk from "chalk";
import { getPackageManager } from "../packagemanager/currentPackageManager.js";
import { ui } from "../environment/userInteraction.js";

export function shouldScanCommand(args) {
  if (!args || args.length === 0) {
    return false;
  }

  return getPackageManager().isSupportedCommand(args);
}

export async function scanCommand(args) {
  if (!shouldScanCommand(args)) {
    return [];
  }

  let timedOut = false;

  const spinner = ui.startProcess(
    "Safe-chain: Scanning for malicious packages..."
  );
  let audit;

  await Promise.race([
    (async () => {
      try {
        const packageManager = getPackageManager();
        const changes = await packageManager.getDependencyUpdatesForCommand(
          args
        );

        if (timedOut) {
          return;
        }

        if (changes.length > 0) {
          spinner.setText(
            `Safe-chain: Scanning ${changes.length} package(s)...`
          );
        }

        audit = await auditChanges(changes);
      } catch (error) {
        spinner.fail(`Safe-chain: Error while scanning.`);
        throw error;
      }
    })(),
    setTimeout(getScanTimeout()).then(() => {
      timedOut = true;
    }),
  ]);

  if (timedOut) {
    spinner.fail("Safe-chain: Timeout exceeded while scanning.");
    throw new Error("Timeout exceeded while scanning npm install command.");
  }

  if (!audit || audit.isAllowed) {
    spinner.stop();
    return 0;
  } else {
    printMaliciousChanges(audit.disallowedChanges, spinner);
    onMalwareFound();
    return 1;
  }
}

function printMaliciousChanges(changes, spinner) {
  spinner.fail("Safe-chain: " + chalk.bold("Malicious changes detected:"));

  for (const change of changes) {
    ui.writeInformation(` - ${change.name}@${change.version}`);
  }
}

function onMalwareFound() {
  ui.emptyLine();
  ui.writeExitWithoutInstallingMaliciousPackages();
  ui.emptyLine();
}
