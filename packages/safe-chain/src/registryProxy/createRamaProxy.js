import { ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtempSync, readFile, writeFile } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { ui } from "../environment/userInteraction.js";

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

  ui.writeWarning(ramaPath);

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
      ui.writeInformation(
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
  let process = spawn(ramaPath, ["--secrets", "memory", "--data", dataFolder], {
    stdio: "inherit",
  });

  // wait some time to allow the proxy process to start
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const proxyAddress = await readFilePromise(
    join(dataFolder, "proxy.addr.txt"),
    "utf-8"
  );
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
