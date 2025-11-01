import * as http from "http";
import * as https from "https";

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 *
 * @returns {void}
 */
export function handleHttpProxyRequest(req, res) {
  // @ts-expect-error req.url might be undefined
  const url = new URL(req.url);

  // The protocol for the plainHttpProxy should usually only be http:
  // but when the client for some reason sends an https: request directly
  // instead of using the CONNECT method, we should handle it gracefully.
  let protocol;
  if (url.protocol === "http:") {
    protocol = http;
  } else if (url.protocol === "https:") {
    protocol = https;
  } else {
    res.writeHead(502);
    res.end(`Bad Gateway: Unsupported protocol ${url.protocol}`);
    return;
  }

  const proxyRequest = protocol
    .request(
      // @ts-expect-error req.url might be undefined
      req.url,
      { method: req.method, headers: req.headers },
      (proxyRes) => {
        // @ts-expect-error statusCode might be undefined
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);

        proxyRes.on("error", () => {
          // Proxy response stream error
          // Clean up client response stream
          if (res.writable) {
            res.end();
          }
        });

        proxyRes.on("close", () => {
          // Clean up if the proxy response stream closes
          if (res.writable) {
            res.end();
          }
        });
      }
    )
    .on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(`Bad Gateway: ${err.message}`);
      } else {
        // Headers already sent, just destroy the response
        res.destroy();
      }
    });

  req.on("error", () => {
    // Client request stream error
    // Abort the proxy request
    proxyRequest.destroy();
  });

  res.on("error", () => {
    // Client response stream error (client disconnected)
    // Clean up proxy streams
    proxyRequest.destroy();
  });

  res.on("close", () => {
    // Client disconnected
    // Abort the proxy request to avoid unnecessary work
    proxyRequest.destroy();
  });

  req.pipe(proxyRequest);
}
