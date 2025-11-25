#!/usr/bin/env node

/**
 * System Proxy Configuration Manager for macOS
 *   node configure-proxy.js --install   # Configure system proxy
 *   node configure-proxy.js --uninstall # Restore original settings
 *   node configure-proxy.js --status    # Check current configuration
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { PROXY_HOST, AGENT_PORT as PROXY_PORT, CONFIG_FILE, BYPASS_DOMAINS } from "./settings.js";

/**
 * Sanitize service name to prevent command injection
 * Network service names from networksetup are trusted, but we sanitize as best practice
 */
function sanitizeServiceName(service) {
  // Remove any characters that could be used for command injection
  return service.replace(/[;&|`$()]/g, "");
}

/**
 * Get all network services on the system
 */
function getNetworkServices() {
  try {
    const output = execSync("networksetup -listallnetworkservices", {
      encoding: "utf-8",
    });

    // Parse output, skip first line (header) and disabled services (marked with *)
    return output
      .split("\n")
      .slice(1)
      .filter((line) => line.trim() && !line.startsWith("*"))
      .map((line) => line.trim());
  } catch (error) {
    console.error("Failed to get network services:", error.message);
    return [];
  }
}

/**
 * Get current proxy settings for a network service
 */
function getCurrentProxySettings(service) {
  try {
    const httpProxy = execSync(`networksetup -getwebproxy "${service}"`, {
      encoding: "utf-8",
    });
    const httpsProxy = execSync(`networksetup -getsecurewebproxy "${service}"`, {
      encoding: "utf-8",
    });

    const parseProxyOutput = (output) => {
      const enabled = output.includes("Enabled: Yes");
      const serverMatch = output.match(/Server: (.+)/);
      const portMatch = output.match(/Port: (\d+)/);

      return {
        enabled,
        server: serverMatch ? serverMatch[1].trim() : "",
        port: portMatch ? parseInt(portMatch[1]) : 0,
      };
    };

    return {
      http: parseProxyOutput(httpProxy),
      https: parseProxyOutput(httpsProxy),
    };
  } catch (error) {
    console.error(`Failed to get proxy settings for ${service}:`, error.message);
    return null;
  }
}

/**
 * Save current proxy settings to restore later
 */
function saveOriginalSettings(services) {
  const settings = {};

  for (const service of services) {
    const current = getCurrentProxySettings(service);
    if (current) {
      settings[service] = current;
    }
  }

  // Ensure directory exists
  const configDir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2));
  console.log(`Saved original proxy settings to ${CONFIG_FILE}`);
}

/**
 * Load saved proxy settings
 */
function loadOriginalSettings() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.warn("No saved settings found");
    return null;
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to load saved settings:", error.message);
    return null;
  }
}

/**
 * Configure proxy for a network service
 */
function configureProxyForService(service) {
  try {
    console.log(`Configuring proxy for: ${service}`);

    // Set HTTP proxy
    execSync(
      `networksetup -setwebproxy "${service}" ${PROXY_HOST} ${PROXY_PORT}`,
      { stdio: "ignore" }
    );

    // Set HTTPS proxy
    execSync(
      `networksetup -setsecurewebproxy "${service}" ${PROXY_HOST} ${PROXY_PORT}`,
      { stdio: "ignore" }
    );

    // Set bypass domains
    const bypassDomainsStr = BYPASS_DOMAINS.join('" "');
    execSync(
      `networksetup -setproxybypassdomains "${service}" "${bypassDomainsStr}"`,
      { stdio: "ignore" }
    );

    // Enable proxies
    execSync(`networksetup -setwebproxystate "${service}" on`, {
      stdio: "ignore",
    });
    execSync(`networksetup -setsecurewebproxystate "${service}" on`, {
      stdio: "ignore",
    });

    console.log(`  Configured: ${service}`);
    return true;
  } catch (error) {
    console.error(`  Failed to configure ${service}:`, error.message);
    return false;
  }
}

/**
 * Restore original proxy settings for a service
 */
function restoreProxyForService(service, settings) {
  try {
    console.log(`Restoring proxy for: ${service}`);

    // Restore HTTP proxy
    if (settings.http.enabled && settings.http.server) {
      execSync(
        `networksetup -setwebproxy "${service}" ${settings.http.server} ${settings.http.port}`,
        { stdio: "ignore" }
      );
      execSync(`networksetup -setwebproxystate "${service}" on`, {
        stdio: "ignore",
      });
    } else {
      execSync(`networksetup -setwebproxystate "${service}" off`, {
        stdio: "ignore",
      });
    }

    // Restore HTTPS proxy
    if (settings.https.enabled && settings.https.server) {
      execSync(
        `networksetup -setsecurewebproxy "${service}" ${settings.https.server} ${settings.https.port}`,
        { stdio: "ignore" }
      );
      execSync(`networksetup -setsecurewebproxystate "${service}" on`, {
        stdio: "ignore",
      });
    } else {
      execSync(`networksetup -setsecurewebproxystate "${service}" off`, {
        stdio: "ignore",
      });
    }

    console.log(`  Restored: ${service}`);
    return true;
  } catch (error) {
    console.error(`  Failed to restore ${service}:`, error.message);
    return false;
  }
}

/**
 * Install: Configure system proxy
 */
function install() {
  console.log("🔧 Configuring system proxy for Aikido Safe Chain...\n");

  const services = getNetworkServices();

  if (services.length === 0) {
    console.error("No network services found");
    process.exit(1);
  }

  console.log(`Found ${services.length} network service(s):\n  - ${services.join("\n  - ")}\n`);

  // Save original settings
  saveOriginalSettings(services);

  // Configure each service
  let successCount = 0;
  for (const service of services) {
    if (configureProxyForService(service)) {
      successCount++;
    }
  }

  console.log(`\nConfigured proxy for ${successCount}/${services.length} network services`);
  console.log(`\nProxy settings:`);
  console.log(`  HTTP Proxy:  ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`  HTTPS Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`  Bypass:      ${BYPASS_DOMAINS.join(", ")}`);
}

/**
 * Uninstall: Restore original proxy settings
 */
function uninstall() {
  console.log("Restoring original proxy settings...\n");

  const savedSettings = loadOriginalSettings();

  if (!savedSettings) {
    console.log("No saved settings found. Disabling proxies...");

    // Just disable proxies for all services
    const services = getNetworkServices();
    for (const service of services) {
      try {
        execSync(`networksetup -setwebproxystate "${service}" off`, {
          stdio: "ignore",
        });
        execSync(`networksetup -setsecurewebproxystate "${service}" off`, {
          stdio: "ignore",
        });
        console.log(`Disabled proxy for: ${service}`);
      } catch (error) {
        console.error(`Failed to disable proxy for ${service}`);
      }
    }
  } else {
    // Restore saved settings
    let successCount = 0;
    const serviceNames = Object.keys(savedSettings);

    for (const service of serviceNames) {
      if (restoreProxyForService(service, savedSettings[service])) {
        successCount++;
      }
    }
    // Remove config file
    try {
      fs.unlinkSync(CONFIG_FILE);
      console.log(`Removed configuration file`);
    } catch (error) {
      console.warn(`Failed to remove config file: ${error.message}`);
    }
  }
}

/**
 * Status: Show current proxy configuration
 */
function status() {
  const services = getNetworkServices();

  for (const service of services) {
    console.log(`${service}:`);
    const settings = getCurrentProxySettings(service);

    if (settings) {
      console.log(`  HTTP:  ${settings.http.enabled ? "OK" : "NOK"} ${settings.http.server || "None"}:${settings.http.port || 0}`);
      console.log(`  HTTPS: ${settings.https.enabled ? "OK" : "NOK"} ${settings.https.server || "None"}:${settings.https.port || 0}`);
    } else {
      console.log("Failed to get settings");
    }
    console.log();
  }

  // Check if Aikido proxy is configured
  const aikidoConfigured = services.some((service) => {
    const settings = getCurrentProxySettings(service);
    return (
      settings &&
      ((settings.http.enabled &&
        settings.http.server === PROXY_HOST &&
        settings.http.port === PROXY_PORT) ||
        (settings.https.enabled &&
          settings.https.server === PROXY_HOST &&
          settings.https.port === PROXY_PORT))
    );
  });

  if (aikidoConfigured) {
    console.log("Aikido Safe Chain proxy is configured");
  } else {
    console.log("Aikido Safe Chain proxy is NOT configured");
  }

  // Check if saved settings exist
  if (fs.existsSync(CONFIG_FILE)) {
    console.log(`Original settings saved at: ${CONFIG_FILE}`);
  } else {
    console.log(`No saved settings found`);
  }
}

/**
 * Main
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log("Aikido Safe Chain - Proxy Configuration Manager");
    console.log("\nUsage:");
    console.log("  node configure-proxy.js --install   # Configure system proxy");
    console.log("  node configure-proxy.js --uninstall # Restore original settings");
    console.log("  node configure-proxy.js --status    # Show current configuration");
    process.exit(0);
  }

  switch (command) {
    case "--install":
    case "install":
      install();
      break;

    case "--uninstall":
    case "uninstall":
      uninstall();
      break;

    case "--status":
    case "status":
      status();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run with --help for usage information');
      process.exit(1);
  }
}

main();
