import { StandaloneProxyService } from "./standaloneProxy.js";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";
import { initializeCliArguments } from "../config/cliArguments.js";
import { getCaCertPath } from "../registryProxy/certUtils.js";

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

  // Note: We no longer call setup() here because the installer sets up
  // system-wide proxy environment variables via LaunchAgent on macOS
  // or systemd on Linux. The certificate is also installed at install time.

  const service = new StandaloneProxyService({ 
    autoVerify: false 
  });

  // Setup event listeners
  service.on("started", ({ port, url }) => {
    ui.emptyLine();
    ui.writeInformation(chalk.green("✔") + " Safe Chain proxy started successfully!");
    ui.emptyLine();
    ui.writeInformation(chalk.bold("Proxy Information:"));
    ui.writeInformation(`  Port: ${chalk.cyan(port)}`);
    ui.writeInformation(`  URL: ${chalk.cyan(url)}`);
    ui.writeInformation(`  PID: ${chalk.cyan(process.pid)}`);
    ui.emptyLine();
    
    ui.writeInformation(chalk.bold("Environment Variables Set:"));
    ui.writeInformation(`  ${chalk.cyan("HTTPS_PROXY")}: http://localhost:${port}`);
    ui.writeInformation(`  ${chalk.cyan("GLOBAL_AGENT_HTTP_PROXY")}: http://localhost:${port}`);
    ui.writeInformation(`  ${chalk.cyan("NODE_EXTRA_CA_CERTS")}: ${getCaCertPath()}`);
    ui.emptyLine();
    
    ui.writeInformation(chalk.bold("Package managers will use the proxy automatically."));
    ui.writeInformation(chalk.dim("  No shell wrappers or aliases needed."));
    ui.emptyLine();
    
    ui.writeInformation(
      chalk.dim("Press Ctrl+C to stop the proxy")
    );
  });

  service.on("stopped", ({ blockedPackages }) => {
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
      
      // Note: We no longer call teardown() here because the environment
      // variables are managed by the system service (LaunchAgent/systemd)
      
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
