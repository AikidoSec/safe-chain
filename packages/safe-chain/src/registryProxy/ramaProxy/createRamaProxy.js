import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtempSync, readFile } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { ui } from "../../environment/userInteraction.js";
import { getLoggingLevel, LOGGING_VERBOSE } from "../../config/settings.js";
import { getReportingServer } from "./reportingServer.js";
import EventEmitter from "node:events";

const readFilePromise = promisify(readFile);

/**
 * @typedef {Object} RamaProxyInstance
 * @property {import("node:child_process").ChildProcess} process
 * @property {string} proxyAddress
 * @property {string} metaAddress
 * @property {string} caCert
 */

/**
 * @returns {String | null}
 */
export function getRamaPath() {
  const executableDir = dirname(process.execPath);
  const ramaPath = join(executableDir, "safechain-proxy");

  if (existsSync(ramaPath)) {
    return ramaPath;
  }

  return null;
}

/**
 * @param {string} ramaPath
 *
 * @returns {import("../registryProxy.js").SafeChainProxy} */
export function createRamaProxy(ramaPath) {
  const tempDir = mkdtempSync(join(tmpdir(), "safe-chain-proxy-"));
  const reportingServer = getReportingServer();
  /** @type {EventEmitter<import("../registryProxy.js").ProxyServerEvents>} */
  const emitter = new EventEmitter();
  /** @type {RamaProxyInstance | null} */
  let ramaInstance = null;

  return Object.assign(emitter, {
    startServer: async () => {
      await reportingServer.start();
      reportingServer.addListener("blockReceived", (ev) =>
        emitter.emit("malwareBlocked", {
          packageName: ev.artifact.identifier,
          packageVersion: ev.artifact.version,
        }),
      );
      ui.writeVerbose(
        `Started reporting server at ${reportingServer.getAddress()}`,
      );
      ramaInstance = await startRama(
        ramaPath,
        tempDir,
        reportingServer.getAddress(),
      );
      ui.writeVerbose(
        `Proxy started at address "${ramaInstance.proxyAddress}"`,
      );
    },
    stopServer: async () => {
      await reportingServer.stop();
      if (ramaInstance) {
        ramaInstance.process.kill();
      }
      return Promise.resolve();
    },
    hasSuppressedVersions: () => false,
    getServerPort: () => {
      if (!ramaInstance) return null;
      const url = new URL(`http://${ramaInstance.proxyAddress}`);
      return url.port ? parseInt(url.port, 10) : null;
    },
    getCaCert: () => ramaInstance?.caCert ?? null,
  });
}

/**
 * @param {string} ramaPath
 * @param {string} dataFolder
 * @param {string} reportingUrl
 * @returns {Promise<RamaProxyInstance>}
 */
async function startRama(ramaPath, dataFolder, reportingUrl) {
  const startTime = Date.now();
  const args = [
    "--secrets",
    "memory",
    "--data",
    dataFolder,
    "--reporting-endpoint",
    reportingUrl,
  ];
  const process =
    getLoggingLevel() === LOGGING_VERBOSE
      ? spawn(ramaPath, args, {
          stdio: "inherit",
        })
      : spawn(ramaPath, args);

  // wait for the proxy process to start (poll for proxy.addr.txt file)
  const proxyAddrPath = join(dataFolder, "proxy.addr.txt");
  const maxWaitTime = 60000; // 60 seconds
  const pollInterval = 500; // 500 ms

  while (!existsSync(proxyAddrPath)) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error("Timeout waiting for proxy to start");
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  const elapsedTime = Date.now() - startTime;
  ui.writeVerbose(`Proxy started in ${elapsedTime}ms`);

  const proxyAddress = await readFilePromise(proxyAddrPath, "utf-8");
  const metaAddress = await readFilePromise(
    join(dataFolder, "meta.addr.txt"),
    "utf-8",
  );

  const certResponse = await fetch(`http://${metaAddress}/ca`);
  const caCert = await certResponse.text();

  return {
    process,
    proxyAddress,
    metaAddress,
    caCert,
  };
}
