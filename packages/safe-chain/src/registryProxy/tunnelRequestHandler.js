import * as net from "net";
import { ui } from "../environment/userInteraction.js";

export function tunnelRequest(req, clientSocket, head) {
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  if (httpsProxy) {
    tunnelRequestViaProxy(req, clientSocket, head, httpsProxy);
  } else {
    tunnelRequestToDestination(req, clientSocket, head);
  }
}

function tunnelRequestToDestination(req, clientSocket, head) {
  const { port, hostname } = new URL(`http://${req.url}`);

  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on("error", (err) => {
    ui.writeError(
      `Safe-chain: error connecting to ${hostname}:${port} - ${err.message}`
    );
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
  });
}

function tunnelRequestViaProxy(req, clientSocket, head, proxyUrl) {
  const { port, hostname } = new URL(`http://${req.url}`);
  const proxy = new URL(proxyUrl);

  // Connect to proxy server
  const proxySocket = net.connect({
    host: proxy.hostname,
    port: proxy.port,
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
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      proxySocket.end();
    }
  });

  proxySocket.on("error", (err) => {
    if (!isConnected) {
      ui.writeError(
        `Safe-chain: error connecting to proxy ${proxy.hostname}:${
          proxy.port || 8080
        } - ${err.message}`
      );
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    }
  });

  clientSocket.on("error", () => {
    proxySocket.end();
  });
}
