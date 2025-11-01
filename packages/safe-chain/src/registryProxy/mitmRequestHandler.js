import https from "https";
import { generateCertForHost } from "./certUtils.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ui } from "../environment/userInteraction.js";

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("net").Socket} clientSocket
 * @param {(target: string) => Promise<boolean>} isAllowed
 */
export function mitmConnect(req, clientSocket, isAllowed) {
  const { hostname } = new URL(`http://${req.url}`);

  clientSocket.on("error", () => {
    // NO-OP
    // This can happen if the client TCP socket sends RST instead of FIN.
    // Not subscribing to 'close' event will cause node to throw and crash.
  });

  const server = createHttpsServer(hostname, isAllowed);

  server.on("error", (err) => {
    ui.writeError(`Safe-chain: HTTPS server error: ${err.message}`);
    // @ts-expect-error Property 'headersSent' does not exist on type 'Socket'
    if (!clientSocket.headersSent) {
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    } else if (clientSocket.writable) {
      clientSocket.end();
    }
  });

  // Establish the connection
  clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

  // Hand off the socket to the HTTPS server
  server.emit("connection", clientSocket);
}

/**
 * @param {string} hostname
 * @param {(target: string) => Promise<boolean>} isAllowed
 * @returns {import("https").Server}
 */
function createHttpsServer(hostname, isAllowed) {
  const cert = generateCertForHost(hostname);

  /**
   * @param {import("http").IncomingMessage} req
   * @param {import("http").ServerResponse} res
   *
   * @returns {Promise<void>}
   */
  async function handleRequest(req, res) {
    // @ts-expect-error req.url might be undefined
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

  const server = https.createServer(
    {
      key: cert.privateKey,
      cert: cert.certificate,
    },
    handleRequest
  );

  return server;
}

/**
 * @param {string} url
 * @returns {*|string}
 */
function getRequestPathAndQuery(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
  }
  return url;
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {string} hostname
 * @param {import("http").ServerResponse} res
 */
function forwardRequest(req, hostname, res) {
  const proxyReq = createProxyRequest(hostname, req, res);

  proxyReq.on("error", () => {
    res.writeHead(502);
    res.end("Bad Gateway");
  });

  req.on("error", (err) => {
    ui.writeError(`Safe-chain: Error reading client request: ${err.message}`);
    proxyReq.destroy();
  });

  req.on("data", (chunk) => {
    proxyReq.write(chunk);
  });

  req.on("end", () => {
    proxyReq.end();
  });
}

/**
 * @param {string} hostname
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 *
 * @returns {import("http").ClientRequest}
 */
function createProxyRequest(hostname, req, res) {
  /** @type {import("http").RequestOptions} */
  const options = {
    hostname: hostname,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers },
  };

  if (options.headers && "host" in options.headers) {
    delete options.headers["host"];
  }

  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpsProxy) {
    options.agent = new HttpsProxyAgent(httpsProxy);
  }

  const proxyReq = https.request(options, (proxyRes) => {
    proxyRes.on("error", (err) => {
      ui.writeError(
        `Safe-chain: Error reading upstream response: ${err.message}`
      );
      if (!res.headersSent) {
        res.writeHead(502);
        res.end("Bad Gateway");
      }
    });

    // @ts-expect-error statusCode might be undefined
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  return proxyReq;
}
