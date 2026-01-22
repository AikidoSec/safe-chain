import { ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtempSync, readFile, writeFile } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { ui } from "../environment/userInteraction.js";
import { getLoggingLevel, LOGGING_VERBOSE } from "../config/settings.js";

const readFilePromise = promisify(readFile);
const writeFilePromise = promisify(writeFile);

/**
 * @typedef {Object} RamaProxyInstance
 * @property {ChildProcess} process
 * @property {string} proxyAddress
 * @property {string} metaAddress
 * @property {string} certPath
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
 * @returns {import("./registryProxy.js").SafeChainProxy} */
export function createRamaProxy(ramaPath) {
  const tempDir = mkdtempSync(join(tmpdir(), "safe-chain-proxy-"));
  /** @type {RamaProxyInstance | null} */
  let ramaInstance = null;

  return {
    startServer: async () => {
      ramaInstance = await startRama(ramaPath, tempDir);
      ui.writeVerbose(
        `Proxy started at address "${ramaInstance.proxyAddress}"`
      );
    },
    stopServer: async () => {
      if (ramaInstance) {
        ramaInstance.process.kill();
      }
      return Promise.resolve();
    },
    verifyNoMaliciousPackages: () => true,
    hasSuppressedVersions: () => false,
    getServerPort: () => {
      if (!ramaInstance) return null;
      const url = new URL(`http://${ramaInstance.proxyAddress}`);
      return url.port ? parseInt(url.port, 10) : null;
    },
    getCombinedCaBundlePath: () => ramaInstance?.certPath ?? "",
  };
}

/**
 * @param {string} ramaPath
 * @param {string} dataFolder
 * @returns {Promise<RamaProxyInstance>}
 */
async function startRama(ramaPath, dataFolder) {
  const startTime = Date.now();
  const args = ["--secrets", "memory", "--data", dataFolder];
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
    "utf-8"
  );

  const certResponse = await fetch(`http://${metaAddress}/ca`);
  const cert = await certResponse.text();
  const certPath = join(dataFolder, "cert.ca");
  await writeFilePromise(certPath, cert);

  return {
    process,
    proxyAddress,
    metaAddress,
    certPath,
  };
}
