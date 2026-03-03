import * as http from "node:http";
import { EventEmitter } from "node:events";

const SERVER_STOP_TIMEOUT_MS = 1000;

/**
 * @typedef {Object} BlockEvent
 * @property {number} ts_ms
 * @property {{ product: string, identifier: string, version: string }} artifact
 */

/**
 * @typedef {{ blockReceived: [BlockEvent] }} ReportingServerEvents
 */

/**
 * @typedef {EventEmitter<ReportingServerEvents> & {
 *   start: () => Promise<void>,
 *   stop: () => Promise<void>,
 *   getAddress: () => string,
 * }} ReportingServer
 */

/**
 * @returns {ReportingServer}
 */
export function getReportingServer() {
  /** @type {EventEmitter<ReportingServerEvents>} */
  const emitter = new EventEmitter();

  /** @type {{server: http.Server | null, address: string }} */
  let state = {server: null, address: ""};

  /** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
  function handleRequest(req, res) {
    if (req.method === "POST" && req.url?.startsWith("/events/block")) {
      parseBlockEventFromRequest(req).then((blockEvent) => {
        emitter.emit("blockReceived", blockEvent);
      });
    }
    res.writeHead(200);
    res.end();
  }

  async function start() {
    state = await startServer(handleRequest);
  }

  function stop() {
    return /** @type {Promise<void>} */ (new Promise((resolve) => {
      if (!state.server) {
        resolve();
        return;
      }
      const timeout = setTimeout(resolve, SERVER_STOP_TIMEOUT_MS);
      state.server.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    }));
  }

  function getAddress() {
    return state.address;
  }

  return Object.assign(emitter, { start, stop, getAddress });
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<BlockEvent>}
 */
function parseBlockEventFromRequest(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
    req.on("error", reject);
  });
}

/**
 * @param {http.RequestListener} requestListener
 * @returns {Promise<{server: http.Server, address: string}>}
 */
function startServer(requestListener) {
  const server = http.createServer(requestListener);

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve({
          address: `http://${address.address}:${address.port}`,
          server,
        });
      } else {
        reject(new Error("Failed to start proxy server"));
      }
    });
  });
}
