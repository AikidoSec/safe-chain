import * as net from "net";
import { getProxyForUrl } from "proxy-from-env";
import { ui } from "../environment/userInteraction.js";

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} clientSocket
 * @param {Buffer} head
 *
 * @returns {void}
 */
export function tunnelRequest(req, clientSocket, head) {
  // req.url in a CONNECT request is usually "hostname:port"
  // We assume HTTPS for CONNECT requests to ensure we check HTTPS_PROXY
  const proxyUrl = getProxyForUrl(`https://${req.url}`);

  if (proxyUrl) {
    // If a proxy is returned, it means we should use it (NO_PROXY check passed)
    tunnelRequestViaProxy(req, clientSocket, head, proxyUrl);
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

  clientSocket.on("error", () => {
    // This can happen if the client TCP socket sends RST instead of FIN.
    // Not subscribing to 'error' event will cause node to throw and crash.
    if (serverSocket.writable) {
      serverSocket.end();
    }
  });

  serverSocket.on("error", (err) => {
    ui.writeError(
      `Safe-chain: error connecting to ${hostname}:${port} - ${err.message}`
    );
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
    const headers = [
      `CONNECT ${hostname}:${port || 443} HTTP/1.1`,
      `Host: ${hostname}:${port || 443}`,
    ];

    if (proxy.username || proxy.password) {
      const auth = Buffer.from(
        `${decodeURIComponent(proxy.username)}:${decodeURIComponent(
          proxy.password
        )}`
      ).toString("base64");
      headers.push(`Proxy-Authorization: Basic ${auth}`);
    }

    headers.push("", "");

    proxySocket.write(headers.join("\r\n"));
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


