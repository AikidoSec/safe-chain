import * as http from "http";
import { tunnelRequest } from "./tunnelRequestHandler.js";
import { mitmConnect } from "./mitmRequestHandler.js";
import { getCaCertPath } from "./certUtils.js";
import { auditChanges } from "../scanning/audit/index.js";
import { knownRegistries, parsePackageFromUrl } from "./parsePackageFromUrl.js";
import { ui } from "../environment/userInteraction.js";
import chalk from "chalk";

const state = {
  port: null,
  blockedRequests: [],
};

export function createSafeChainProxy() {
  const server = createProxyServer();
  server.on("connect", handleConnect);

  return {
    startServer: () => startServer(server),
    stopServer: () => stopServer(server),
    getBlockedRequests: () => state.blockedRequests,
    verifyNoMaliciousPackages,
  };
}

function getSafeChainProxyEnvironmentVariables() {
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
  const server = http.createServer((_, res) => {
    res.writeHead(400, "Bad Request");
    res.write(
      "Safe-chain proxy: Direct http not supported. Only CONNECT requests are allowed."
    );
    res.end();
  });

  return server;
}

function startServer(server) {
  return new Promise((resolve, reject) => {
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
    setTimeout(() => resolve(), 1000);
  });
}

function handleConnect(req, clientSocket, head) {
  // CONNECT method is used for HTTPS requests
  // It establishes a tunnel to the server identified by the request URL

  if (knownRegistries.some((reg) => req.url.includes(reg))) {
    // For npm and yarn registries, we want to intercept and inspect the traffic
    // so we can block packages with malware
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
    return;
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
  ui.writeError("Exiting without installing malicious packages.");
  ui.emptyLine();

  process.exit(1);
}
