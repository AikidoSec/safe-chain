import { StandaloneProxyService } from "./standaloneProxy.js";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";
import { initializeCliArguments } from "../config/cliArguments.js";
import { writeProxyState, clearProxyState } from "./proxyState.js";
import { getCaCertPath } from "../registryProxy/certUtils.js";
import { setup } from "../shell-integration/setup.js";
import { teardown } from "../shell-integration/teardown.js";

/**
 * Run the Safe Chain proxy as a standalone service
 * @param {string[]} args - Command line arguments
 */
export async function runCommand(args) {
  // Agent mode automatically supports all package managers
  // No need to specify ecosystem - it's determined by the URL being proxied
  
  // Convert --verbose to safe-chain argument format
  const processedArgs = args.map(arg => {
    if (arg === "--verbose" || arg === "-v") {
      return "--safe-chain-logging=verbose";
    }
    return arg;
  });
  
  // Initialize logging from args
  initializeCliArguments(processedArgs);

  // Automatically set up shell integration
  await setup();
  ui.emptyLine();

  const service = new StandaloneProxyService({ 
    autoVerify: false 
  });

  // Setup event listeners
  service.on("started", ({ port, url }) => {
    // Write proxy state to file so shell integration can detect it
    writeProxyState({
      port,
      url,
      pid: process.pid,
      ecosystem: 'all',
      certPath: getCaCertPath(),
    });

    ui.emptyLine();
    ui.writeInformation(chalk.green("✔") + " Safe Chain proxy started successfully!");
    ui.emptyLine();
    ui.writeInformation(chalk.bold("Proxy Information:"));
    ui.writeInformation(`  Port: ${chalk.cyan(port)}`);
    ui.writeInformation(`  URL: ${chalk.cyan(url)}`);
    ui.writeInformation(`  PID: ${chalk.cyan(process.pid)}`);
    ui.emptyLine();
    
    ui.writeInformation(chalk.bold("How to Use:"));
    ui.writeInformation(chalk.dim("  Restart your terminal, then run package managers normally:"));
    ui.writeInformation(chalk.cyan("    npm install <package>"));
    ui.writeInformation(chalk.cyan("    yarn add <package>"));
    ui.writeInformation(chalk.cyan("    pip3 install <package>"));
    ui.emptyLine();
    
    ui.writeInformation(
      chalk.dim("Press Ctrl+C to stop the proxy")
    );
  });

  service.on("stopped", ({ blockedPackages }) => {
    // Clear proxy state file
    clearProxyState();
    
    ui.emptyLine();
    ui.writeInformation(chalk.yellow("Proxy stopped."));
    
    if (blockedPackages.length > 0) {
      ui.emptyLine();
      ui.writeInformation(
        chalk.red(`⚠ Blocked ${blockedPackages.length} malicious package(s):`)
      );
      for (const pkg of blockedPackages) {
        ui.writeInformation(
          `  - ${chalk.bold(pkg.packageName)}@${pkg.version}`
        );
      }
    } else {
      ui.writeInformation(chalk.green("No malicious packages detected."));
    }
    ui.emptyLine();
  });

  // Handle graceful shutdown
  let isShuttingDown = false;
  
  const shutdown = async () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    ui.emptyLine();
    ui.writeInformation(chalk.yellow("Shutting down proxy..."));
    
    try {
      await service.stop();
      
      // Remove shell integration
      ui.emptyLine();
      await teardown();
      
      process.exit(0);
    } catch (/** @type {any} */ error) {
      ui.writeError(`Error stopping proxy: ${error.message}`);
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the service
  try {
    await service.start();
    
    // Keep the process running
    // The proxy will continue to intercept requests until interrupted
    await new Promise(() => {}); // Never resolves - keeps process alive
  } catch (/** @type {any} */ error) {
    ui.writeError(`Failed to start proxy: ${error.message}`);
    process.exit(1);
  }
}
