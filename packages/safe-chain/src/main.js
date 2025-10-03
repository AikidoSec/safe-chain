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
      await scanCommand(args);
    }
  } catch (error) {
    ui.writeError("Failed to check for malicious packages:", error.message);
    process.exit(1);
  }

  var result = await getPackageManager().runCommand(args);

  await proxy.stopServer();
  proxy.verifyNoMaliciousPackages();

  ui.emptyLine();
  ui.writeInformation(
    `${chalk.green(
      "✔"
    )} Safe-chain: Command completed, no malicious packages found.`
  );

  return result.status;
}
