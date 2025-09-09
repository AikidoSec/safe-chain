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

  const spinner = ui.startProcess("Scanning for malicious packages...");
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
          spinner.setText(`Scanning ${changes.length} package(s)...`);
        }

        audit = await auditChanges(changes);
      } catch (error) {
        spinner.fail(`Error while scanning: ${error.message}`);
        throw error;
      }
    })(),
    setTimeout(getScanTimeout()).then(() => {
      timedOut = true;
    }),
  ]);

  if (timedOut) {
    spinner.fail("Timeout exceeded while scanning.");
    throw new Error("Timeout exceeded while scanning npm install command.");
  }

  if (!audit || audit.isAllowed) {
    spinner.succeed("No malicious packages detected.");
  } else {
    printMaliciousChanges(audit.disallowedChanges, spinner);
    await acceptRiskOrExit();
  }
}

function printMaliciousChanges(changes, spinner) {
  spinner.fail(chalk.bold("Malicious changes detected:"));

  for (const change of changes) {
    ui.writeInformation(` - ${change.name}@${change.version}`);
  }
}

async function acceptRiskOrExit() {
  // Check if the user has explicitly allowed risky installations
  if (process.env.INSTALL_A_POSSIBLY_MALICIOUS_PACKAGE === "1") {
    ui.emptyLine();
    ui.writeInformation("INSTALL_A_POSSIBLY_MALICIOUS_PACKAGE=1 detected. Continuing with the installation despite risks...");
    return;
  }

  // Default secure behavior: exit without prompting
  ui.emptyLine();
  ui.writeInformation("Installation blocked due to malicious packages detected.");
  ui.writeInformation("To override this safety check, run with: INSTALL_A_POSSIBLY_MALICIOUS_PACKAGE=1");
  ui.emptyLine();
  process.exit(1);
}
