#!/usr/bin/env node

import { scanCommand, shouldScanCommand } from "./scanning/index.js";
import { ui } from "./environment/userInteraction.js";
import { getPackageManager } from "./packagemanager/currentPackageManager.js";
import { initializeCliArguments } from "./config/cliArguments.js";
import { createSafeChainProxy } from "./registryProxy/registryProxy.js";
import chalk from "chalk";

export async function main(args) {
  process.on("SIGINT", handleProcessTermination);
  process.on("SIGTERM", handleProcessTermination);

  const proxy = createSafeChainProxy();
  await proxy.startServer();

  // Global error handlers to log unhandled errors
  process.on("uncaughtException", (error) => {
    ui.writeError(`Safe-chain: Uncaught exception: ${error.message}`);
    ui.writeVerbose(`Stack trace: ${error.stack}`);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    ui.writeError(`Safe-chain: Unhandled promise rejection: ${reason}`);
    if (reason instanceof Error) {
      ui.writeVerbose(`Stack trace: ${reason.stack}`);
    }
    process.exit(1);
  });

  try {
    // This parses all the --safe-chain arguments and removes them from the args array
    args = initializeCliArguments(args);

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

    if (!proxy.verifyNoMaliciousPackages()) {
      return 1;
    }

    ui.emptyLine();
    ui.writeInformation(
      `${chalk.green(
        "✔"
      )} Safe-chain: Command completed, no malicious packages found.`
    );

    // Returning the exit code back to the caller allows the promise
    //  to be awaited in the bin files and return the correct exit code
    return packageManagerResult.status;
  } catch (error) {
    ui.writeError("Failed to check for malicious packages:", error.message);

    // Returning the exit code back to the caller allows the promise
    //  to be awaited in the bin files and return the correct exit code
    return 1;
  } finally {
    await proxy.stopServer();
  }
}

function handleProcessTermination() {
  ui.writeBufferedLogsAndStopBuffering();
}
