import * as http from "http";
import { tunnelRequest } from "./tunnelRequestHandler.js";
import { mitmConnect } from "./mitmRequestHandler.js";
import { handleHttpProxyRequest } from "./plainHttpProxy.js";
import { getCombinedCaBundlePath, cleanupCertBundle } from "./certBundle.js";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";
import { createInterceptorForUrl } from "./interceptors/createInterceptorForEcoSystem.js";
import { getHasSuppressedVersions } from "./interceptors/suppressedVersionsState.js";

const SERVER_STOP_TIMEOUT_MS = 1000;
/**
 * @type {{
 *   port: number | null,
 *   blockedRequests: {packageName: string, version: string, url: string}[],
 *   blockedMinimumAgeRequests: {packageName: string, version: string, url: string}[]
 * }}
 */
const state = {
  port: null,
  blockedRequests: [],
  blockedMinimumAgeRequests: [],
};

export function createSafeChainProxy() {
  const server = createProxyServer();

  return {
    startServer: () => startServer(server),
    stopServer: () => stopServer(server),
    hasBlockedMaliciousPackages,
    hasBlockedMinimumAgeRequests,
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

  const proxyUrl = `http://127.0.0.1:${state.port}`;
  const caCertPath = getCombinedCaBundlePath();

  return {
    HTTPS_PROXY: proxyUrl,
    GLOBAL_AGENT_HTTP_PROXY: proxyUrl,
    NODE_EXTRA_CA_CERTS: caCertPath,
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
    // Bind to loopback only. Without an explicit host, Node listens on every
    // interface, turning the proxy into an unauthenticated forward proxy that
    // anyone reachable on the network can use to hit the victim's localhost,
    // intranet, or cloud metadata endpoints. Port 0 lets the OS pick a port.
    server.listen(0, "127.0.0.1", () => {
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
        cleanupCertBundle();
        resolve();
      });
    } catch {
      resolve();
    }
    setTimeout(() => {
      cleanupCertBundle();
      resolve();
    }, SERVER_STOP_TIMEOUT_MS);
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
    interceptor.on(
      "malwareBlocked",
      (
        /** @type {import("./interceptors/interceptorBuilder.js").MalwareBlockedEvent} */ event
      ) => {
        onMalwareBlocked(event.packageName, event.version, event.targetUrl);
      }
    );
    interceptor.on(
      "minimumAgeRequestBlocked",
      (
        /** @type {import("./interceptors/interceptorBuilder.js").MinimumAgeRequestBlockedEvent} */ event
      ) => {
        onMinimumAgeRequestBlocked(
          event.packageName,
          event.version,
          event.targetUrl
        );
      }
    );

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

/**
 *
 * @param {string} packageName
 * @param {string} version
 * @param {string} url
 */
function onMinimumAgeRequestBlocked(packageName, version, url) {
  state.blockedMinimumAgeRequests.push({ packageName, version, url });
}

function hasBlockedMaliciousPackages() {
  if (state.blockedRequests.length === 0) {
    return false;
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

  return true;
}

function hasBlockedMinimumAgeRequests() {
  if (state.blockedMinimumAgeRequests.length === 0) {
    return false;
  }

  ui.emptyLine();

  ui.writeInformation(
    `Safe-chain: ${chalk.bold(
      `blocked ${state.blockedMinimumAgeRequests.length} direct package download request(s) due to minimum package age`
    )}:`
  );

  for (const req of state.blockedMinimumAgeRequests) {
    ui.writeInformation(` - ${req.packageName}@${req.version} (${req.url})`);
  }

  ui.writeInformation(
    `  To disable this check, use: ${chalk.cyan(
      "--safe-chain-skip-minimum-package-age"
    )}`
  );

  ui.emptyLine();
  ui.writeError(
    "Safe-chain: Exiting without installing packages blocked by the direct download minimum package age check."
  );
  ui.emptyLine();

  return true;
}
