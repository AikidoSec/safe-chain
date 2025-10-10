import https from "https";
import { generateCertForHost } from "./certUtils.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { logProxyError, logProxyInfo } from "./proxyLogger.js";

export function mitmConnect(req, clientSocket, isAllowed) {
  try {
    const { hostname } = new URL(`http://${req.url}`);

    // Log all events on clientSocket
    const originalEmit = clientSocket.emit;
    clientSocket.emit = function (event, ...args) {
      logProxyInfo(`[clientSocket event] ${event} - ${req.url}`);
      return originalEmit.apply(this, [event, ...args]);
    };

    // Listen to all common socket events
    clientSocket.on("error", (err) => {
      logProxyError(`clientSocket error for ${req.url}: ${err.message}`);
      cleanup();
    });

    clientSocket.on("end", () => {
      logProxyInfo(`clientSocket end event for ${req.url}`);
    });

    clientSocket.on("close", (hadError) => {
      logProxyInfo(`clientSocket closed for ${req.url}, hadError: ${hadError}`);
      cleanup();
    });

    clientSocket.on("timeout", () => {
      logProxyInfo(`clientSocket timeout for ${req.url}`);
    });

    let serverClosed = false;
    const cleanup = () => {
      if (!serverClosed) {
        serverClosed = true;
        logProxyInfo(`Closing server for ${req.url}`);
        server.close();
      }
    };

    const server = createHttpsServer(hostname, isAllowed, cleanup);

    // Log server events
    server.on("close", () => {
      logProxyInfo(`[server event] close - ${req.url}`);
    });

    server.on("request", (serverReq) => {
      logProxyInfo(`[server event] request ${serverReq.method} ${serverReq.url} - ${hostname}`);
    });

    // Establish the connection
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

    // Hand off the socket to the HTTPS server
    server.emit("connection", clientSocket);
  } catch (error) {
    logProxyError(`Error in mitmConnect: ${error}`);
  }
}

function createHttpsServer(hostname, isAllowed) {
  const cert = generateCertForHost(hostname);

  async function handleRequest(req, res) {
    const pathAndQuery = getRequestPathAndQuery(req.url);
    const targetUrl = `https://${hostname}${pathAndQuery}`;

    if (!(await isAllowed(targetUrl))) {
      res.writeHead(403, "Forbidden - blocked by safe-chain");
      res.end("Blocked by safe-chain");
      return;
    }

    // Collect request body
    forwardRequest(req, hostname, res);
  }

  return https.createServer(
    {
      key: cert.privateKey,
      cert: cert.certificate,
    },
    handleRequest
  );
}

function getRequestPathAndQuery(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
  }
  return url;
}

function forwardRequest(req, hostname, res) {
  const proxyReq = createProxyRequest(hostname, req, res);

  proxyReq.on("error", (err) => {
    logProxyError(`Error in forwardRequest proxyReq ${err}`);
    res.writeHead(502);
    res.end("Bad Gateway");
  });

  req.on("data", (chunk) => {
    proxyReq.write(chunk);
  });

  req.on("end", () => {
    logProxyInfo(`Forwarded request to ${hostname}${req.url}`);
    proxyReq.end();
  });
}

function createProxyRequest(hostname, req, res) {
  const options = {
    hostname: hostname,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers },
  };

  delete options.headers.host;

  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpsProxy) {
    options.agent = new HttpsProxyAgent(httpsProxy);
  }

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  return proxyReq;
}
