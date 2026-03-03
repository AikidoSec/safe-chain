import * as http from "http";
import { tunnelRequest } from "./tunnelRequestHandler.js";
import { mitmConnect } from "./mitmRequestHandler.js";
import { handleHttpProxyRequest } from "./plainHttpProxy.js";
import { ui } from "../../environment/userInteraction.js";
import { createInterceptorForUrl } from "./interceptors/createInterceptorForEcoSystem.js";
import { getHasSuppressedVersions } from "./interceptors/npm/modifyNpmInfo.js";
import { getCaCertPath } from "./certUtils.js";
import { readFileSync } from "fs";
import EventEmitter from "events";

/** *
 * @returns {import("../registryProxy.js").SafeChainProxy} */
export function createBuiltInProxyServer() {
  const SERVER_STOP_TIMEOUT_MS = 1000;
  /**
   * @type {{port: number | null}}
   */
  const state = {
    port: null,
  };
  /** @type {EventEmitter<import("../registryProxy.js").ProxyServerEvents>} */
  const emitter = new EventEmitter();

  const server = http.createServer(
    // This handles direct HTTP requests (non-CONNECT requests)
    // This is normally http-only traffic, but we also handle
    // https for clients that don't properly use CONNECT
    handleHttpProxyRequest,
  );

  // This handles HTTPS requests via the CONNECT method
  server.on("connect", handleConnect);

  return Object.assign(emitter, {
    startServer: () => startServer(server),
    stopServer: () => stopServer(server),
    hasSuppressedVersions: getHasSuppressedVersions,
    getServerPort: () => state.port,
    getCaCert,
  });

  /**
   * @param {import("http").Server} server
   *
   * @returns {Promise<void>}
   */
  function startServer(server) {
    return new Promise((resolve, reject) => {
      // Passing port 0 makes the OS assign an available port
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          state.port = address.port;
          resolve();
        } else {
          reject(new Error("Failed to start proxy server"));
        }
      });

      server.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * @param {import("http").Server} server
   *
   * @returns {Promise<void>}
   */
  function stopServer(server) {
    return new Promise((resolve) => {
      try {
        server.close(() => {
          resolve();
        });
      } catch {
        resolve();
      }
      setTimeout(() => resolve(), SERVER_STOP_TIMEOUT_MS);
    });
  }

  /**
   * @param {import("http").IncomingMessage} req
   * @param {import("http").ServerResponse} clientSocket
   * @param {Buffer} head
   *
   * @returns {void}
   */
  function handleConnect(req, clientSocket, head) {
    // CONNECT method is used for HTTPS requests
    // It establishes a tunnel to the server identified by the request URL

    const interceptor = createInterceptorForUrl(req.url || "");

    if (interceptor) {
      // Subscribe to malware blocked events
      interceptor.on(
        "malwareBlocked",
        (
          /** @type {import("./interceptors/interceptorBuilder.js").MalwareBlockedEvent} */ event,
        ) => {
          emitter.emit("malwareBlocked", {
            packageName: event.packageName,
            packageVersion: event.version
          });
        },
      );

      mitmConnect(req, clientSocket, interceptor);
    } else {
      // For other hosts, just tunnel the request to the destination tcp socket
      ui.writeVerbose(`Safe-chain: Tunneling request to ${req.url}`);
      tunnelRequest(req, clientSocket, head);
    }
  }

  function getCaCert() {
    try {
      const safeChainPath = getCaCertPath();
      return readFileSync(safeChainPath, "utf8");
    } catch {
      return null;
    }
  }
}
