import https from "https";
import { generateCertForHost } from "./certUtils.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ui } from "../environment/userInteraction.js";
import { gunzipSync, gzipSync } from "zlib";

/**
 * @typedef {import("./interceptors/interceptorBuilder.js").Interceptor} Interceptor
 */

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} clientSocket
 * @param {Interceptor} interceptor
 */
export function mitmConnect(req, clientSocket, interceptor) {
  ui.writeVerbose(`Safe-chain: Set up MITM tunnel for ${req.url}`);
  const { hostname } = new URL(`http://${req.url}`);

  clientSocket.on("error", (err) => {
    ui.writeVerbose(
      `Safe-chain: Client socket error for ${req.url}: ${err.message}`
    );
    // NO-OP
    // This can happen if the client TCP socket sends RST instead of FIN.
    // Not subscribing to 'close' event will cause node to throw and crash.
  });

  const server = createHttpsServer(hostname, interceptor);

  server.on("error", (err) => {
    ui.writeError(`Safe-chain: HTTPS server error: ${err.message}`);
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
 * @param {Interceptor} interceptor
 * @returns {import("https").Server}
 */
function createHttpsServer(hostname, interceptor) {
  const cert = generateCertForHost(hostname);

  /**
   * @param {import("http").IncomingMessage} req
   * @param {import("http").ServerResponse} res
   *
   * @returns {Promise<void>}
   */
  async function handleRequest(req, res) {
    if (!req.url) {
      ui.writeError("Safe-chain: Request missing URL");
      res.writeHead(400, "Bad Request");
      res.end("Bad Request: Missing URL");
      return;
    }

    const pathAndQuery = getRequestPathAndQuery(req.url);
    const targetUrl = `https://${hostname}${pathAndQuery}`;

    const requestInterceptor = await interceptor.handleRequest(targetUrl);
    const blockResponse = requestInterceptor.blockResponse;

    if (blockResponse) {
      ui.writeVerbose(`Safe-chain: Blocking request to ${targetUrl}`);
      res.writeHead(blockResponse.statusCode, blockResponse.message);
      res.end(blockResponse.message);
      return;
    }

    // Collect request body
    forwardRequest(req, hostname, res, requestInterceptor);
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
 * @returns {string}
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
 * @param {import("./interceptors/interceptorBuilder.js").RequestInterceptionHandler} requestHandler
 */
function forwardRequest(req, hostname, res, requestHandler) {
  const proxyReq = createProxyRequest(hostname, req, res, requestHandler);

  proxyReq.on("error", (err) => {
    ui.writeVerbose(
      `Safe-chain: Error occurred while proxying request: ${err.message}`
    );
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
    ui.writeVerbose(
      `Safe-chain: Finished proxying request to ${req.url} for ${hostname}`
    );
    proxyReq.end();
  });
}

/**
 * @param {string} hostname
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {import("./interceptors/interceptorBuilder.js").RequestInterceptionHandler} requestHandler
 *
 * @returns {import("http").ClientRequest}
 */
function createProxyRequest(hostname, req, res, requestHandler) {
  /** @type {NodeJS.Dict<string | string[]> | undefined} */
  let headers = { ...req.headers };
  // Remove the host header from the incoming request before forwarding.
  // Node's http module sets the correct host header for the target hostname automatically.
  if (headers.host) {
    delete headers.host;
  }
  headers = requestHandler.modifyRequestHeaders(headers);

  /** @type {import("http").RequestOptions} */
  const options = {
    hostname: hostname,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...headers },
  };

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

    if (!proxyRes.statusCode) {
      ui.writeError("Safe-chain: Proxy response missing status code");
      res.writeHead(500);
      res.end("Internal Server Error");
      return;
    }

    const { statusCode, headers } = proxyRes;

    if (requestHandler.modifiesResponse()) {
      /** @type {Array<any>} */
      let chunks = [];

      proxyRes.on("data", (chunk) => chunks.push(chunk));

      proxyRes.on("end", () => {
        /** @type {Buffer} */
        let buffer = Buffer.concat(chunks);

        if (proxyRes.headers["content-encoding"] === "gzip") {
          buffer = gunzipSync(buffer);
        }

        buffer = requestHandler.modifyBody(buffer, headers);

        if (proxyRes.headers["content-encoding"] === "gzip") {
          buffer = gzipSync(buffer);
        }

        res.writeHead(statusCode, headers);
        res.end(buffer);
      });
    } else {
      // If the response is not being modified, we can
      // just pipe without the need for buffering the output
      res.writeHead(statusCode, headers);
      proxyRes.pipe(res);
    }
  });

  return proxyReq;
}
