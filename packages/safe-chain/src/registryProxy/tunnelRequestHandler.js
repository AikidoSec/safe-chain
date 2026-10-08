import * as net from "net";
import { ui } from "../environment/userInteraction.js";
import { isImdsEndpoint } from "./isImdsEndpoint.js";
import { getConnectTimeout } from "./getConnectTimeout.js";

/** @type {string[]} */
let timedoutImdsEndpoints = [];
let nextTunnelId = 0;

/**
 * Byte counts are TCP totals, including CONNECT for system proxies.
 * @param {import("http").ServerResponse} clientSocket
 * @param {string} target
 * @param {string} route
 */
function createTunnelDiagnostics(clientSocket, target, route) {
  const label = `tunnel #${++nextTunnelId} ${target} (${route})`;
  const started = Date.now();
  let established = false;
  ui.writeVerbose(`Safe-chain: ${label} opening`);
  clientSocket.on("end", () => ui.writeVerbose(`Safe-chain: ${label} client FIN`));
  clientSocket.on("error", (err) =>
    ui.writeVerbose(`Safe-chain: ${label} client error: ${formatSocketError(err)}`)
  );
  return {
    label,
    /** @param {import("net").Socket} socket */
    observeUpstream(socket) {
      socket.on("end", () => ui.writeVerbose(`Safe-chain: ${label} upstream FIN`));
      socket.once("close", () => ui.writeVerbose(
        `Safe-chain: ${label} upstream closed after ${Date.now() - started}ms; established=${established}; TCP bytes up=${socket.bytesWritten} down=${socket.bytesRead}`
      ));
    },
    connected() {
      established = true;
      ui.writeVerbose(
        `Safe-chain: ${label} established after ${Date.now() - started}ms`
      );
    },
  };
}

/** @param {Error & { code?: string }} err */
function formatSocketError(err) {
  return `${err.code || "UNKNOWN"} (${err.message})`;
}

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
  const targetPort = Number.parseInt(port) || 443;
  const diagnostics = createTunnelDiagnostics(
    clientSocket,
    `${hostname}:${targetPort}`,
    "direct"
  );

  if (timedoutImdsEndpoints.includes(hostname)) {
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    if (isImds) {
      ui.writeVerbose(
        `Safe-chain: ${diagnostics.label} closing because previously timedout connect to ${hostname}`
      );
    } else {
      ui.writeError(
        `Safe-chain: ${diagnostics.label} closing because previously timedout connect to ${hostname}`
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
        `Safe-chain: ${diagnostics.label} connect timed out after ${connectTimeout}ms`
      );
    } else {
      ui.writeError(
        `Safe-chain: ${diagnostics.label} connect timed out after ${connectTimeout}ms`
      );
    }
    serverSocket.destroy();
    if (clientSocket.writable) {
      clientSocket.end("HTTP/1.1 504 Gateway Timeout\r\n\r\n");
    }
  }, connectTimeout);

  let isConnected = false;
  const serverSocket = net.connect(
    {
      port: targetPort,
      host: hostname,
      // Forward the upstream FIN without automatically ending our writable side.
      // The client may still have data in flight; pipe() forwards its FIN too.
      allowHalfOpen: true,
    },
    () => {
      // Clear timer to prevent false timeout errors after successful connection
      clearTimeout(connectTimer);
      if (clientSocket.destroyed || clientSocket.writableEnded) {
        serverSocket.destroy();
        return;
      }
      isConnected = true;
      diagnostics.connected();

      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    }
  );
  diagnostics.observeUpstream(serverSocket);

  clientSocket.on("error", () => {
    // This can happen if the client TCP socket sends RST instead of FIN.
    // Not subscribing to 'error' event will cause node to throw and crash.
    clearTimeout(connectTimer);
    serverSocket.destroy();
  });

  clientSocket.on("close", () => {
    // Client closed connection - clean up server socket
    clearTimeout(connectTimer);
    serverSocket.destroy();
  });

  serverSocket.on("error", (err) => {
    clearTimeout(connectTimer);
    if (isConnected) {
      ui.writeVerbose(
        `Safe-chain: ${diagnostics.label} upstream error after CONNECT: ${formatSocketError(err)}`
      );
      // Once CONNECT succeeds, this socket carries TLS, not HTTP. Sending a
      // plaintext 502 here corrupts that stream instead of reporting closure.
      clientSocket.destroy();
      return;
    }
    if (isImds) {
      ui.writeVerbose(
        `Safe-chain: error connecting to ${hostname}:${targetPort} [${diagnostics.label}] - ${formatSocketError(err)}`
      );
    } else {
      ui.writeError(
        `Safe-chain: error connecting to ${hostname}:${targetPort} [${diagnostics.label}] - ${formatSocketError(err)}`
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
  const diagnostics = createTunnelDiagnostics(
    clientSocket,
    `${hostname}:${port || 443}`,
    `proxy ${proxy.hostname}:${proxy.port || 80}`
  );

  // Connect to proxy server
  const proxySocket = net.connect({
    host: proxy.hostname,
    port: Number.parseInt(proxy.port) || 80,
    allowHalfOpen: true,
  });
  diagnostics.observeUpstream(proxySocket);

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
      if (clientSocket.destroyed || clientSocket.writableEnded) {
        proxySocket.destroy();
        return;
      }
      isConnected = true;
      diagnostics.connected();
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      proxySocket.write(head);
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
    } else {
      ui.writeError(
        `Safe-chain: ${diagnostics.label} proxy CONNECT failed: ${response.split("\r\n")[0]}`
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
        `Safe-chain: ${diagnostics.label} error connecting to proxy - ${formatSocketError(err)}`
      );
      if (clientSocket.writable) {
        clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      }
    } else {
      ui.writeVerbose(
        `Safe-chain: ${diagnostics.label} proxy socket error after CONNECT: ${formatSocketError(err)}`
      );
      clientSocket.destroy();
    }
  });

  proxySocket.on("end", () => {
    if (!isConnected) {
      ui.writeError(
        `Safe-chain: ${diagnostics.label} proxy closed connection before completing CONNECT`
      );
      if (clientSocket.writable) {
        clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      }
      // No pipe is established yet to end our half-open writable side.
      proxySocket.destroy();
    }
  });

  clientSocket.on("error", () => {
    proxySocket.destroy();
  });

  clientSocket.on("close", () => {
    proxySocket.destroy();
  });

  proxySocket.on("close", () => {
    if (clientSocket.writable) {
      clientSocket.end();
    }
  });
}
