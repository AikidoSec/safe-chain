#!/usr/bin/env node

/**
 * Aikido Safe Chain Agent - Long Running Daemon (Mac only for now)
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { AGENT_PORT, LOG_DIR, PID_FILE } from "./settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set ecosystem to ALL for system-wide protection (both JS and Python)
const { setEcoSystem, ECOSYSTEM_ALL } = await import("./lib/config/settings.js");
setEcoSystem(ECOSYSTEM_ALL);

// Import proxy infrastructure from lib (copied during build)
const { createSafeChainProxy } = await import("./lib/registryProxy/registryProxy.js");

/**
 * Logger that writes to both stdout and log files
 */
class AgentLogger {
  constructor() {
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
      try {
        fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o755 });
      } catch (error) {
        console.error(`Failed to create log directory: ${error.message}`);
      }
    }
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
  }

  error(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}`;
    console.error(logMessage);
  }

  info(message) {
    this.log(`INFO: ${message}`);
  }

  warn(message) {
    this.log(`WARN: ${message}`);
  }
}

const logger = new AgentLogger();

/**
 * Main
 */
class SafeChainAgent {
  constructor() {
    this.proxy = null;
    this.httpServer = null;
    this.isShuttingDown = false;
  }

  /**
   * Start the agent
   */
  async start() {
    logger.info("Starting Aikido POC Safe Chain Agent...");

    // Write PID file
    this.writePidFile();

    // Setup signal handlers
    this.setupSignalHandlers();

    // Start proxy server
    try {
      await this.startProxyServer();
      logger.info(`Agent started successfully on port ${AGENT_PORT}`);
      logger.info("System-wide malware protection is now active");
    } catch (error) {
      logger.error(`Failed to start agent: ${error.message}`);
      logger.error(error.stack);
      process.exit(1);
    }
  }

  /**
   * Start the MITM proxy server
   */
  async startProxyServer() {
    // Create proxy using existing infrastructure
    this.proxy = createSafeChainProxy();

    // We need to adapt the proxy to use a fixed port instead of random port
    // Create custom server that wraps the proxy
    this.httpServer = await this.createFixedPortProxyServer();

    logger.info(`Proxy server listening on http://127.0.0.1:${AGENT_PORT}`);
  }

  /**
   * Create proxy server on fixed port
   * 
   * This adapts the existing createSafeChainProxy() which uses random ports
   * to use our fixed port for system-wide configuration
   */
  async createFixedPortProxyServer() {
    const { tunnelRequest } = await import("./lib/registryProxy/tunnelRequestHandler.js");
    const { mitmConnect } = await import("./lib/registryProxy/mitmRequestHandler.js");
    const { handleHttpProxyRequest } = await import("./lib/registryProxy/plainHttpProxy.js");
    const { createInterceptorForUrl } = await import("./lib/registryProxy/interceptors/createInterceptorForEcoSystem.js");

    const server = http.createServer(handleHttpProxyRequest);

    // Handle HTTPS CONNECT requests
    server.on("connect", (req, clientSocket, head) => {
      const interceptor = createInterceptorForUrl(req.url || "");

      if (interceptor) {
        // Subscribe to malware blocked events
        interceptor.on("malwareBlocked", (event) => {
          logger.warn(
            `Blocked malicious package: ${event.packageName}@${event.version} from ${event.url}`
          );
        });

        mitmConnect(req, clientSocket, interceptor);
      } else {
        // For non-registry hosts, just tunnel
        tunnelRequest(req, clientSocket, head);
      }
    });

    // Start server on fixed port
    await new Promise((resolve, reject) => {
      server.listen(AGENT_PORT, "127.0.0.1", () => {
        resolve();
      });

      server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          logger.error(`Port ${AGENT_PORT} is already in use. Is another instance running?`);
        }
        reject(err);
      });
    });

    return server;
  }

  /**
   * Write PID file for process management
   */
  writePidFile() {
    try {
      fs.writeFileSync(PID_FILE, process.pid.toString());
      logger.info(`PID file written: ${PID_FILE}`);
    } catch (error) {
      logger.warn(`Failed to write PID file: ${error.message}`);
    }
  }

  /**
   * Remove PID file
   */
  removePidFile() {
    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    } catch (error) {
      logger.warn(`Failed to remove PID file: ${error.message}`);
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setupSignalHandlers() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        logger.warn("Shutdown already in progress...");
        return;
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Stop accepting new connections
        if (this.httpServer) {
          await new Promise((resolve) => {
            this.httpServer.close(() => {
              logger.info("HTTP server closed");
              resolve();
            });
          });
        }

        // Remove PID file
        this.removePidFile();

        logger.info("Agent stopped successfully");
        process.exit(0);
      } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.error(`Uncaught exception: ${error.message}`);
      logger.error(error.stack);
      // Let launchd restart us
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      logger.error(`Unhandled promise rejection: ${reason}`);
      if (reason instanceof Error) {
        logger.error(reason.stack);
      }
      // Let launchd restart us
      process.exit(1);
    });
  }
}

// Start the agent
const agent = new SafeChainAgent();
await agent.start();

// Keep process running
process.stdin.resume();
