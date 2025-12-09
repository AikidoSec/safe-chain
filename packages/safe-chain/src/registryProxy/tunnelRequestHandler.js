import * as net from "net";
import { ui } from "../environment/userInteraction.js";
import { isImdsEndpoint } from "./isImdsEndpoint.js";

/** @type {string[]} */
let timedoutImdsEndpoints = [];

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} clientSocket
 * @param {Buffer} head
 *
 * @returns {void}
 */
export function tunnelRequest(req, clientSocket, head) {
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  if (httpsProxy) {
    // If an HTTPS proxy is set, tunnel the request via the proxy
    // This is the system proxy, not the safe-chain proxy
    // The package manager will run via the safe-chain proxy
    // The safe-chain proxy will then send the request to the system proxy
    // Typical flow: package manager -> safe-chain proxy -> system proxy -> destination

    // There are 2 processes involved in this:
    // 1. Safe-chain process: has HTTPS_PROXY set to system proxy
    // 2. Package manager process: has HTTPS_PROXY set to safe-chain proxy

    tunnelRequestViaProxy(req, clientSocket, head, httpsProxy);
  } else {
    tunnelRequestToDestination(req, clientSocket, head);
  }
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} clientSocket
 * @param {Buffer} head
 *
 * @returns {void}
 */
function tunnelRequestToDestination(req, clientSocket, head) {
  const { port, hostname } = new URL(`http://${req.url}`);
  const isImds = isImdsEndpoint(hostname);

  if (timedoutImdsEndpoints.includes(hostname)) {
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    if (isImds) {
      ui.writeVerbose(
        `Safe-chain: Closing connection because previously timedout connect to ${hostname}`
      );
    } else {
      ui.writeError(
        `Safe-chain: Closing connection because previously timedout connect to ${hostname}`
      );
    }
    return;
  }

  const serverSocket = net.connect(
    Number.parseInt(port) || 443,
    hostname,
    () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    }
  );

  // Set explicit connection timeout to avoid waiting for OS default (~2 minutes).
  // IMDS endpoints get shorter timeout (3s) since they're commonly unreachable outside cloud environments.
  const connectTimeout = getConnectTimeout(hostname);
  serverSocket.setTimeout(connectTimeout);

  serverSocket.on("timeout", () => {
    // Suppress error logging for IMDS endpoints - timeouts are expected when not in cloud
    if (isImds) {
      timedoutImdsEndpoints.push(hostname);
      ui.writeVerbose(
        `Safe-chain: connect to ${hostname}:${
          port || 443
        } timed out after ${connectTimeout}ms`
      );
    } else {
      ui.writeError(
        `Safe-chain: connect to ${hostname}:${
          port || 443
        } timed out after ${connectTimeout}ms`
      );
    }
    serverSocket.destroy(); // Clean up socket to prevent event loop hanging
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
  });

  clientSocket.on("error", () => {
    // This can happen if the client TCP socket sends RST instead of FIN.
    // Not subscribing to 'error' event will cause node to throw and crash.
    if (serverSocket.writable) {
      serverSocket.end();
    }
  });

  serverSocket.on("error", (err) => {
    if (isImds) {
      ui.writeVerbose(
        `Safe-chain: error connecting to ${hostname}:${port} - ${err.message}`
      );
    } else {
      ui.writeError(
        `Safe-chain: error connecting to ${hostname}:${port} - ${err.message}`
      );
    }
    if (clientSocket.writable) {
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    }
  });
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} clientSocket
 * @param {Buffer} head
 * @param {string} proxyUrl
 */
function tunnelRequestViaProxy(req, clientSocket, head, proxyUrl) {
  const { port, hostname } = new URL(`http://${req.url}`);
  const proxy = new URL(proxyUrl);

  // Connect to proxy server
  const proxySocket = net.connect({
    host: proxy.hostname,
    port: Number.parseInt(proxy.port) || 80,
  });

  proxySocket.on("connect", () => {
    // Send CONNECT request to proxy
    const connectRequest = [
      `CONNECT ${hostname}:${port || 443} HTTP/1.1`,
      `Host: ${hostname}:${port || 443}`,
      "",
      "",
    ].join("\r\n");

    proxySocket.write(connectRequest);
  });

  let isConnected = false;
  proxySocket.once("data", (data) => {
    const response = data.toString();

    // Check if CONNECT succeeded (HTTP/1.1 200)
    if (response.startsWith("HTTP/1.1 200")) {
      isConnected = true;
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      proxySocket.write(head);
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
    } else {
      ui.writeError(
        `Safe-chain: proxy CONNECT failed: ${response.split("\r\n")[0]}`
      );
      if (clientSocket.writable) {
        clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      }
      if (proxySocket.writable) {
        proxySocket.end();
      }
    }
  });

  proxySocket.on("error", (err) => {
    if (!isConnected) {
      ui.writeError(
        `Safe-chain: error connecting to proxy ${proxy.hostname}:${
          proxy.port || 8080
        } - ${err.message}`
      );
      if (clientSocket.writable) {
        clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      }
    } else {
      ui.writeError(
        `Safe-chain: proxy socket error after connection - ${err.message}`
      );
      if (clientSocket.writable) {
        clientSocket.end();
      }
    }
  });

  clientSocket.on("error", () => {
    if (proxySocket.writable) {
      proxySocket.end();
    }
  });
}

/**
 * Returns appropriate connection timeout for a host.
 * - IMDS endpoints: 3s (fail fast when outside cloud, reduce 5min delay to ~20s)
 * - Other endpoints: 30s (allow for slow networks while preventing indefinite hangs)
 */
function getConnectTimeout(/** @type {string} */ host) {
  if (isImdsEndpoint(host)) {
    return 3000;
  }
  return 30000;
}
