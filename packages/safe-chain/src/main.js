#!/usr/bin/env node

import { scanCommand, shouldScanCommand } from "./scanning/index.js";
import { ui } from "./environment/userInteraction.js";
import { getPackageManager } from "./packagemanager/currentPackageManager.js";
import { initializeCliArguments } from "./config/cliArguments.js";
import { getLogFile } from "./config/settings.js";
import { createSafeChainProxy } from "./registryProxy/registryProxy.js";
import chalk from "chalk";
import { getAuditStats } from "./scanning/audit/index.js";
import {
  initializeFileLogger,
  closeFileLogger,
  closeFileLoggerSync,
} from "./environment/fileLogger.js";

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function main(args) {
  if (isSafeChainVerify(args)) {
    return 0;
  }

  process.on("SIGINT", handleProcessTermination);
  process.on("SIGTERM", handleProcessTermination);

  const proxy = createSafeChainProxy();
  await proxy.startServer();

  // Global error handlers to log unhandled errors
  process.on("uncaughtException", (error) => {
    ui.writeError(`Safe-chain: Uncaught exception: ${error.message}`);
    ui.writeVerbose(`Stack trace: ${error.stack}`);
    ui.writeBufferedLogsAndStopBuffering();
    closeFileLoggerSync();
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    ui.writeError(`Safe-chain: Unhandled promise rejection: ${reason}`);
    if (reason instanceof Error) {
      ui.writeVerbose(`Stack trace: ${reason.stack}`);
    }
    ui.writeBufferedLogsAndStopBuffering();
    closeFileLoggerSync();
    process.exit(1);
  });

  try {
    // This parses all the --safe-chain arguments and removes them from the args array
    args = initializeCliArguments(args);

    const logFile = getLogFile();
    if (logFile) {
      // Use the console-only warning sink: ui.writeWarning would re-enter
      // writeToLogFile, creating a cycle whenever the logger needs to
      // report its own failure.
      initializeFileLogger(logFile, ui.writeWarningToConsole);
    }

    if (shouldScanCommand(args)) {
      const commandScanResult = await scanCommand(args);

      // Returning the exit code back to the caller allows the promise
      //  to be awaited in the bin files and return the correct exit code
      if (commandScanResult !== 0) {
        return commandScanResult;
      }
    }

    // Buffer logs during package manager execution, this avoids interleaving
    //  of logs from the package manager and safe-chain
    // Not doing this could cause bugs to disappear when cursor movement codes
    //  are written by the package manager while safe-chain is writing logs
    ui.startBufferingLogs();
    const packageManagerResult = await getPackageManager().runCommand(args);

    // Write all buffered logs
    ui.writeBufferedLogsAndStopBuffering();

    if (proxy.hasBlockedMaliciousPackages()) {
      return 1;
    }

    if (proxy.hasBlockedMinimumAgeRequests()) {
      return 1;
    }

    const auditStats = getAuditStats();
    if (auditStats.totalPackages > 0) {
      ui.writeVerbose(
        `${chalk.green("✔")} Safe-chain: Scanned ${
          auditStats.totalPackages
        } packages, no malware found.`,
      );
    }

    if (proxy.hasSuppressedVersions()) {
      ui.writeInformation(
        `${chalk.yellow(
          "ℹ",
        )} Safe-chain: Some package versions were suppressed during package metadata resolution due to minimum package age.`,
      );
      ui.writeInformation(
        `  To disable this check, use: ${chalk.cyan(
          "--safe-chain-skip-minimum-package-age",
        )}`,
      );
    }

    // Returning the exit code back to the caller allows the promise
    //  to be awaited in the bin files and return the correct exit code
    return packageManagerResult.status;
  } catch (/** @type any */ error) {
    ui.writeError("Failed to check for malicious packages:", error.message);
    ui.writeBufferedLogsAndStopBuffering();

    // Returning the exit code back to the caller allows the promise
    //  to be awaited in the bin files and return the correct exit code
    return 1;
  } finally {
    // Both must run even if one throws. Losing the session-end entry
    // because stopServer() rejected (or vice versa) defeats the point of
    // having a log on failure paths.
    await Promise.allSettled([proxy.stopServer(), closeFileLogger()]);
  }
}

function handleProcessTermination() {
  ui.writeBufferedLogsAndStopBuffering();
  closeFileLoggerSync();
}

/** @param {string[]} args  */
function isSafeChainVerify(args) {
  const safeChainCheckCommand = "safe-chain-verify";
  if (args.length > 0 && args[0] === safeChainCheckCommand) {
    ui.writeInformation("OK: Safe-chain works!");
    return true;
  }
}
