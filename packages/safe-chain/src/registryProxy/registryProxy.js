import * as http from "http";
import { tunnelRequest } from "./tunnelRequestHandler.js";
import { mitmConnect } from "./mitmRequestHandler.js";
import { handleHttpProxyRequest } from "./plainHttpProxy.js";
import { getCaCertPath } from "./certUtils.js";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";
import { createInterceptorForUrl } from "./interceptors/createInterceptorForEcoSystem.js";
import { getHasSuppressedVersions } from "./interceptors/npm/modifyNpmInfo.js";

const SERVER_STOP_TIMEOUT_MS = 1000;
/**
 * @type {{port: number | null, blockedRequests: {packageName: string, version: string, url: string}[]}}
 */
const state = {
  port: null,
  blockedRequests: [],
};

export function createSafeChainProxy() {
  const server = createProxyServer();

  return {
    startServer: () => startServer(server),
    stopServer: () => stopServer(server),
    verifyNoMaliciousPackages,
    hasSuppressedVersions: getHasSuppressedVersions,
  };
}

/**
 * @returns {Record<string, string>}
 */
function getSafeChainProxyEnvironmentVariables() {
  if (!state.port) {
    return {};
  }

  return {
    HTTPS_PROXY: `http://localhost:${state.port}`,
    GLOBAL_AGENT_HTTP_PROXY: `http://localhost:${state.port}`,
    NODE_EXTRA_CA_CERTS: getCaCertPath(),
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
