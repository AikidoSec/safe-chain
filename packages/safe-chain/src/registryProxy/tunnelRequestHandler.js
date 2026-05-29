import * as net from "net";
import { ui } from "../environment/userInteraction.js";
import { isImdsEndpoint } from "./isImdsEndpoint.js";
import { getConnectTimeout } from "./getConnectTimeout.js";

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
  try {
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
  } catch (/** @type {any} */ err) {
    ui.writeError(
      `Safe-chain: tunnel request failed for ${req.url} : ${err.message}`
    );
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
  const targetPort = Number.parseInt(port) || 443;

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

  const connectTimeout = getConnectTimeout(hostname);

  // Use JS setTimeout for true connection timeout (not idle timeout).
  // socket.setTimeout() measures inactivity, not time since connection attempt.
  const connectTimer = setTimeout(() => {
    if (isImds) {
      timedoutImdsEndpoints.push(hostname);
      ui.writeVerbose(
        `Safe-chain: connect to ${hostname}:${targetPort} timed out after ${connectTimeout}ms`
      );
    } else {
      ui.writeError(
        `Safe-chain: connect to ${hostname}:${targetPort} timed out after ${connectTimeout}ms`
      );
    }
    serverSocket.destroy();
    if (clientSocket.writable) {
      clientSocket.end("HTTP/1.1 504 Gateway Timeout\r\n\r\n");
    }
  }, connectTimeout);

  const serverSocket = net.connect(targetPort, hostname, () => {
    // Clear timer to prevent false timeout errors after successful connection
    clearTimeout(connectTimer);

    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  clientSocket.on("error", () => {
    // This can happen if the client TCP socket sends RST instead of FIN.
    // Not subscribing to 'error' event will cause node to throw and crash.
    clearTimeout(connectTimer);
    if (serverSocket.writable) {
      serverSocket.end();
    }
  });

  clientSocket.on("close", () => {
    // Client closed connection - clean up server socket
    clearTimeout(connectTimer);
    if (serverSocket.writable) {
      serverSocket.end();
    }
  });

  serverSocket.on("error", (err) => {
    clearTimeout(connectTimer);
    if (isImds) {
      ui.writeVerbose(
        `Safe-chain: error connecting to ${hostname}:${targetPort} - ${err.message}`
      );
    } else {
      ui.writeError(
        `Safe-chain: error connecting to ${hostname}:${targetPort} - ${err.message}`
      );
    }
    if (clientSocket.writable) {
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    }
  });

  serverSocket.on("close", () => {
    // Server closed connection - clean up client socket
    clearTimeout(connectTimer);
    if (clientSocket.writable) {
      clientSocket.end();
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

