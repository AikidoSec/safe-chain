import { EventEmitter } from "node:events";
import { createSafeChainProxy } from "../registryProxy/registryProxy.js";

/**
 * @typedef {Object} StandaloneProxyOptions
 * @property {(event: MalwareBlockedEvent) => void} [onMalwareDetected] - Callback when malware is detected
 * @property {boolean} [autoVerify=false] - Automatically verify for malicious packages on stop
 * @property {boolean} [keepAlive=true] - Keep the process alive while proxy is running (disable for tests)
 */

/**
 * @typedef {Object} MalwareBlockedEvent
 * @property {string} packageName - Name of the blocked package
 * @property {string} version - Version of the blocked package
 * @property {string} url - URL that was blocked
 */

/**
 * @typedef {Object} ProxyInfo
 * @property {number} port - Port number the proxy is listening on
 * @property {string} url - Full proxy URL (http://localhost:port)
 * @property {Record<string, string>} environmentVariables - Environment variables to set for clients
 */

/**
 * Standalone proxy service for running the Safe Chain proxy as a long-lived service
 * or agent, independent of CLI usage. Suitable for integration with tools like VS Code
 * extensions or other development environments.
 *
 * The agent mode automatically supports all package managers (npm, yarn, pnpm, pip, etc.)
 * without needing to specify an ecosystem.
 *
 * @example
 * const service = new StandaloneProxyService();
 * const info = await service.start();
 * console.log(`Proxy running on port ${info.port}`);
 * // ... later
 * await service.stop();
 */
export class StandaloneProxyService extends EventEmitter {
  /**
   * @param {StandaloneProxyOptions} [options={}]
   */
  constructor(options = {}) {
    super();
    this.options = {
      onMalwareDetected: options.onMalwareDetected,
      autoVerify: options.autoVerify || false,
      keepAlive: options.keepAlive !== undefined ? options.keepAlive : true,
    };
    this.proxy = null;
    this.isRunning = false;
  }

  /**
   * Start the proxy server
   * @returns {Promise<ProxyInfo>}
   * @throws {Error} If proxy is already running or fails to start
   */
  async start() {
    if (this.isRunning) {
      throw new Error("Proxy is already running");
    }

    // Agent mode always supports all package managers
    // The interceptor will automatically try both npm and pip based on the URL
    // No need to set a specific ecosystem

    this.proxy = createSafeChainProxy();
    this.proxy.setKeepAlive(this.options.keepAlive);
    await this.proxy.startServer();
    this.isRunning = true;

    const port = this.proxy.getPort();
    const url = this.proxy.getProxyUrl();
    const environmentVariables = this.proxy.getEnvironmentVariables();

    if (!port || !url) {
      throw new Error("Failed to start proxy server: no port assigned");
    }

    // Emit started event
    this.emit("started", { port, url, environmentVariables });

    return {
      port,
      url,
      environmentVariables,
    };
  }

  /**
   * Stop the proxy server
   * @returns {Promise<{blockedPackages: MalwareBlockedEvent[]}>}
   * @throws {Error} If proxy is not running
   */
  async stop() {
    if (!this.isRunning || !this.proxy) {
      throw new Error("Proxy is not running");
    }

    const blockedRequests = this.proxy.getBlockedRequests();

    // If autoVerify is enabled, check for malicious packages
    if (this.options.autoVerify) {
      const hasNoMalware = this.proxy.verifyNoMaliciousPackages();
      if (!hasNoMalware) {
        this.emit("malwareDetected", blockedRequests);
      }
    }

    await this.proxy.stopServer();
    this.isRunning = false;

    // Emit stopped event
    this.emit("stopped", { blockedPackages: blockedRequests });

    return {
      blockedPackages: blockedRequests,
    };
  }

  /**
   * Get current proxy information
   * @returns {ProxyInfo | null}
   */
  getInfo() {
    if (!this.isRunning || !this.proxy) {
      return null;
    }

    const port = this.proxy.getPort();
    const url = this.proxy.getProxyUrl();

    if (!port || !url) {
      return null;
    }

    return {
      port,
      url,
      environmentVariables: this.proxy.getEnvironmentVariables(),
    };
  }

  /**
   * Get list of blocked requests (if any)
   * @returns {MalwareBlockedEvent[]}
   */
  getBlockedRequests() {
    if (!this.proxy) {
      return [];
    }

    return this.proxy.getBlockedRequests();
  }

  /**
   * Check if the proxy is currently running
   * @returns {boolean}
   */
  isProxyRunning() {
    return this.isRunning;
  }

  /**
   * Restart the proxy server
   * @returns {Promise<ProxyInfo>}
   */
  async restart() {
    if (this.isRunning) {
      await this.stop();
    }
    return await this.start();
  }
}
