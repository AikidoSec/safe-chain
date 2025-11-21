import * as http from "http";
import { tunnelRequest } from "./tunnelRequestHandler.js";
import { mitmConnect } from "./mitmRequestHandler.js";
import { handleHttpProxyRequest } from "./plainHttpProxy.js";
import { getCaCertPath } from "./certUtils.js";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";
import { createInterceptorForUrl } from "./interceptors/createInterceptorForEcoSystem.js";

const SERVER_STOP_TIMEOUT_MS = 1000;

/**
 * @type {{port: number | null, blockedRequests: {packageName: string, version: string, url: string}[], keepAlive: boolean, certPath: string | null}}
 */
const state = {
  port: null,
  blockedRequests: [],
  keepAlive: true, // By default, keep process alive
  certPath: null,
};

/**
 * Set the proxy state (used when connecting to an existing proxy)
 * @param {number} port - The port number
 * @param {string} certPath - The certificate path
 */
export function setProxyState(port, certPath) {
  state.port = port;
  state.certPath = certPath;
}

/**
 * @typedef {Object} ProxyOptions
 * @property {boolean} [keepAlive=true] - Whether to keep the Node.js process alive
 */

/**
 * @typedef {Object} ProxyControl
 * @property {() => Promise<void>} startServer - Start the proxy server
 * @property {() => Promise<void>} stopServer - Stop the proxy server
 * @property {() => boolean} verifyNoMaliciousPackages - Verify no malicious packages were blocked
 * @property {() => number | null} getPort - Get the proxy server port
 * @property {() => string | null} getProxyUrl - Get the proxy URL
 * @property {() => Record<string, string>} getEnvironmentVariables - Get environment variables for the proxy
 * @property {() => Array<{packageName: string, version: string, url: string}>} getBlockedRequests - Get blocked package requests
 * @property {(keepAlive: boolean) => void} setKeepAlive - Set whether to keep process alive
 */

/**
 * @param {ProxyOptions} [options={}] - Configuration options
 * @returns {ProxyControl} Proxy control object
 */
export function createSafeChainProxy(options = {}) {
  const server = createProxyServer();

  // Initialize keepAlive from options if provided
  if (options.keepAlive !== undefined) {
    state.keepAlive = options.keepAlive;
  }

  return {
    startServer: () => startServer(server),
    stopServer: () => stopServer(server),
    verifyNoMaliciousPackages,
    getPort: () => state.port,
    getProxyUrl: () => (state.port ? `http://localhost:${state.port}` : null),
    getEnvironmentVariables: () => getSafeChainProxyEnvironmentVariables(),
    getBlockedRequests: () => [...state.blockedRequests],
    setKeepAlive: (/** @type {boolean} */ keepAlive) => {
      state.keepAlive = keepAlive;
    },
  };
}

/**
 * @returns {Record<string, string>}
 */
function getSafeChainProxyEnvironmentVariables() {
  if (!state.port) {
    return {};
  }

  const certPath = state.certPath || getCaCertPath();

  return {
    HTTPS_PROXY: `http://localhost:${state.port}`,
    GLOBAL_AGENT_HTTP_PROXY: `http://localhost:${state.port}`,
    NODE_EXTRA_CA_CERTS: certPath,
  };
}

/**
 * @param {Record<string, string | undefined>} env
 *
 * @returns {Record<string, string>}
 */
export function mergeSafeChainProxyEnvironmentVariables(env) {
  const proxyEnv = getSafeChainProxyEnvironmentVariables();

  for (const key of Object.keys(env)) {
    // If we were to simply copy all env variables, we might overwrite
    // the proxy settings set by safe-chain when casing varies (e.g. http_proxy vs HTTP_PROXY)
    // So we only copy the variable if it's not already set in a different case
    const upperKey = key.toUpperCase();

    if (!proxyEnv[upperKey] && env[key]) {
      proxyEnv[key] = env[key];
    }
  }

  return proxyEnv;
}

function createProxyServer() {
  const server = http.createServer(
    // This handles direct HTTP requests (non-CONNECT requests)
    // This is normally http-only traffic, but we also handle
    // https for clients that don't properly use CONNECT
    handleHttpProxyRequest
  );

  // This handles HTTPS requests via the CONNECT method
  server.on("connect", handleConnect);

  return server;
}

/**
 * @param {import("http").Server} server
 *
 * @returns {Promise<void>}
 */
function startServer(server) {
  return new Promise((resolve, reject) => {
    // Passing port 0 makes the OS assign an available port
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        state.port = address.port;
        // Only unref if keepAlive is false (for tests)
        if (!state.keepAlive) {
          server.unref();
        }
        resolve();
      } else {
        reject(new Error("Failed to start proxy server"));
      }
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * @param {import("http").Server} server
 *
 * @returns {Promise<void>}
 */
function stopServer(server) {
  return new Promise((resolve) => {
    try {
      server.close(() => {
        resolve();
      });
    } catch {
      resolve();
    }
    setTimeout(() => resolve(), SERVER_STOP_TIMEOUT_MS);
  });
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} clientSocket
 * @param {Buffer} head
 *
 * @returns {void}
 */
function handleConnect(req, clientSocket, head) {
  // CONNECT method is used for HTTPS requests
  // It establishes a tunnel to the server identified by the request URL

  const interceptor = createInterceptorForUrl(req.url || "");

  if (interceptor) {
    // Subscribe to package checked events
    interceptor.on("packageChecked", (event) => {
      ui.writeVerbose(
        `Safe-chain: Checking package ${event.packageName}@${event.version}`
      );
    });

    // Subscribe to malware blocked events
    interceptor.on("malwareBlocked", (event) => {
      onMalwareBlocked(event.packageName, event.version, event.url);
    });

    mitmConnect(req, clientSocket, interceptor);
  } else {
    // For other hosts, just tunnel the request to the destination tcp socket
    ui.writeVerbose(`Safe-chain: Tunneling request to ${req.url}`);
    tunnelRequest(req, clientSocket, head);
  }
}

/**
 *
 * @param {string} packageName
 * @param {string} version
 * @param {string} url
 */
function onMalwareBlocked(packageName, version, url) {
  state.blockedRequests.push({ packageName, version, url });
}

function verifyNoMaliciousPackages() {
  if (state.blockedRequests.length === 0) {
    // No malicious packages were blocked, so nothing to block
    return true;
  }

  ui.emptyLine();

  ui.writeInformation(
    `Safe-chain: ${chalk.bold(
      `blocked ${state.blockedRequests.length} malicious package downloads`
    )}:`
  );

  for (const req of state.blockedRequests) {
    ui.writeInformation(` - ${req.packageName}@${req.version} (${req.url})`);
  }

  ui.emptyLine();
  ui.writeExitWithoutInstallingMaliciousPackages();
  ui.emptyLine();

  return false;
}
