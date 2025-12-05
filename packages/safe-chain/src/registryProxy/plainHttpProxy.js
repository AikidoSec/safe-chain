import * as http from "http";
import * as https from "https";
import { ui } from "../environment/userInteraction.js";

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 *
 * @returns {void}
 */
export function handleHttpProxyRequest(req, res) {
  if (!req.url) {
    ui.writeError("Safe-chain: Request missing URL");
    res.writeHead(400, "Bad Request");
    res.end("Bad Request: Missing URL");
    return;
  }

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
      req.url,
      { method: req.method, headers: req.headers },
      (proxyRes) => {
        if (!proxyRes.statusCode) {
          ui.writeError("Safe-chain: Proxy response missing status code");
          res.writeHead(500);
          res.end("Internal Server Error");
          return;
        }

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
