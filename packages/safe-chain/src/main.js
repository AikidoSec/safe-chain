#!/usr/bin/env node

import { scanCommand, shouldScanCommand } from "./scanning/index.js";
import { ui } from "./environment/userInteraction.js";
import { getPackageManager } from "./packagemanager/currentPackageManager.js";
import { initializeCliArguments } from "./config/cliArguments.js";
import { createSafeChainProxy } from "./registryProxy/registryProxy.js";
import chalk from "chalk";
import { getAuditStats } from "./scanning/audit/index.js";
import { readProxyState } from "./agent/proxyState.js";

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function main(args) {
  process.on("SIGINT", handleProcessTermination);
  process.on("SIGTERM", handleProcessTermination);

  // Check if a proxy is already running from 'safe-chain run'
  const existingProxy = readProxyState();
  const usingExistingProxy = existingProxy !== null;
  
  let proxy;
  if (usingExistingProxy) {
    // Use the existing proxy - don't start a new one
    ui.writeInformation(`Safe-chain: Using existing proxy at ${existingProxy.url}`);
    // Create a proxy object that uses the existing proxy
    // We need to set the environment variables to point to the existing proxy
    const url = new URL(existingProxy.url);
    const port = parseInt(url.port);
    
    // Import and set the proxy state so getSafeChainProxyEnvironmentVariables works
    const { setProxyState } = await import("./registryProxy/registryProxy.js");
    setProxyState(port, existingProxy.certPath);
    
    proxy = {
      verifyNoMaliciousPackages: () => true, // Existing proxy handles this
      getBlockedRequests: () => [], // Can't access blocked requests from existing proxy
      stopServer: async () => {}, // Don't stop the existing proxy
    };
  } else {
    // No existing proxy, start one inline
    proxy = createSafeChainProxy();
    await proxy.startServer();
  }

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

    const auditStats = getAuditStats();
    if (auditStats.totalPackages > 0) {
      ui.emptyLine();
      if (usingExistingProxy) {
        ui.writeInformation(
          `${chalk.green("✔")} Safe-chain: Scanned ${
            auditStats.totalPackages
          } packages via proxy, no malware found.`
        );
      } else {
        ui.writeInformation(
          `${chalk.green("✔")} Safe-chain: Scanned ${
            auditStats.totalPackages
          } packages, no malware found.`
        );
      }
    }

    // Returning the exit code back to the caller allows the promise
    //  to be awaited in the bin files and return the correct exit code
    return packageManagerResult.status;
  } catch (/** @type any */ error) {
    ui.writeError("Failed to check for malicious packages:", error.message);

    // Returning the exit code back to the caller allows the promise
    //  to be awaited in the bin files and return the correct exit code
    return 1;
  } finally {
    // Only stop the proxy if we started it (not using existing proxy)
    if (!usingExistingProxy) {
      await proxy.stopServer();
    }
  }
}

function handleProcessTermination() {
  ui.writeBufferedLogsAndStopBuffering();
}
