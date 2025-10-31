import * as http from "http";
import { tunnelRequest } from "./tunnelRequestHandler.js";
import { mitmConnect } from "./mitmRequestHandler.js";
import { handleHttpProxyRequest } from "./plainHttpProxy.js";
import { getCaCertPath } from "./certUtils.js";
import { auditChanges } from "../scanning/audit/index.js";
import { knownJsRegistries, knownPipRegistries, parsePackageFromUrl } from "./parsePackageFromUrl.js";
import { getEcoSystem, ECOSYSTEM_JS, ECOSYSTEM_PY } from "../config/settings.js";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";

const SERVER_STOP_TIMEOUT_MS = 1000;
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
  };
}

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

export function mergeSafeChainProxyEnvironmentVariables(env) {
  const proxyEnv = getSafeChainProxyEnvironmentVariables();

  for (const key of Object.keys(env)) {
    // If we were to simply copy all env variables, we might overwrite
    // the proxy settings set by safe-chain when casing varies (e.g. http_proxy vs HTTP_PROXY)
    // So we only copy the variable if it's not already set in a different case
    const upperKey = key.toUpperCase();

    if (!proxyEnv[upperKey]) {
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

function handleConnect(req, clientSocket, head) {
  // CONNECT method is used for HTTPS requests
  // It establishes a tunnel to the server identified by the request URL

  const ecosystem = getEcoSystem();
  const url = req.url || "";

  let isKnownRegistry = false;
  if (ecosystem === ECOSYSTEM_JS) {
    isKnownRegistry = knownJsRegistries.some((reg) => url.includes(reg));
  } else if (ecosystem === ECOSYSTEM_PY) {
    isKnownRegistry = knownPipRegistries.some((reg) => url.includes(reg));
  }

  if (isKnownRegistry) {
    mitmConnect(req, clientSocket, isAllowedUrl);
  } else {
    // For other hosts, just tunnel the request to the destination tcp socket
    tunnelRequest(req, clientSocket, head);
  }
}

async function isAllowedUrl(url) {
  const { packageName, version } = parsePackageFromUrl(url);

  // packageName and version are undefined when the URL is not a package download
  // In that case, we can allow the request to proceed
  if (!packageName || !version) {
    return true;
  }

  const auditResult = await auditChanges([
    { name: packageName, version, type: "add" },
  ]);

  if (!auditResult.isAllowed) {
    state.blockedRequests.push({ packageName, version, url });
    return false;
  }

  return true;
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
