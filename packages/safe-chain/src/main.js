#!/usr/bin/env node

import { scanCommand, shouldScanCommand } from "./scanning/index.js";
import { ui } from "./environment/userInteraction.js";
import { getPackageManager } from "./packagemanager/currentPackageManager.js";
import { initializeCliArguments } from "./config/cliArguments.js";
import { createSafeChainProxy } from "./registryProxy/registryProxy.js";
import chalk from "chalk";

export async function main(args) {
  const proxy = createSafeChainProxy();
  await proxy.startServer();

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

    const packageManagerResult = await getPackageManager().runCommand(args);

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
