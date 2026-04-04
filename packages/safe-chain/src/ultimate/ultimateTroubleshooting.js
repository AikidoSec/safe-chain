import { platform } from 'os';
import { ui } from "../environment/userInteraction.js";
import { readFileSync, existsSync } from "node:fs";
import {randomUUID} from "node:crypto";
import {createWriteStream, readdirSync, statSync} from "fs";
import path from "node:path";
import yazl from "yazl";

export async function printUltimateLogs() {
  const { proxyLogPath, ultimateLogPath, proxyErrLogPath, ultimateErrLogPath } = getPathsPerPlatform();

  await printLogs(
    "SafeChain Proxy",
    proxyLogPath,
    proxyErrLogPath
  );

  await printLogs(
    "SafeChain Ultimate",
    ultimateLogPath,
    ultimateErrLogPath
  );
}

export async function troubleshootingExport() {
  const { logDir } = getPathsPerPlatform();
  return new Promise((resolve, reject) => {
    if (!existsSync(logDir)) {
      ui.writeError(`Log directory not found: ${logDir}`);
      reject(new Error(`Log directory not found: ${logDir}`));
      return;
    }

    const date = new Date().toISOString().split('T')[0];
    const uuid = randomUUID();
    const zipFileName = `safechain-ultimate-${date}-${uuid}.zip`;
    const zipfile = new yazl.ZipFile();
    const entries = readdirSync(logDir);
    for (const entry of entries) {
      const fullPath = path.join(logDir, entry);
      if (statSync(fullPath).isFile()) {
        zipfile.addFile(fullPath, entry);
      }
    }
    zipfile.end();

    const output = createWriteStream(zipFileName);
    zipfile.outputStream.pipe(output);

    output.on('close', () => {
      ui.writeInformation(`Logs collected and zipped as: ${path.resolve(zipFileName)}`);
      resolve(zipFileName);
    });

    output.on('error', (/** @type {Error} */ err) => {
      ui.writeError(`Failed to zip logs: ${err.message}`);
      reject(err);
    });
  });
}


function getPathsPerPlatform() {
  const os = platform();
  if (os === 'win32') {
    const logDir = `C:\\ProgramData\\AikidoSecurity\\SafeChainUltimate\\logs`;
    return {
      logDir,
      proxyLogPath: `${logDir}\\SafeChainProxy.log`,
      ultimateLogPath: `${logDir}\\SafeChainUltimate.log`,
      proxyErrLogPath: `${logDir}\\SafeChainProxy.err`,
      ultimateErrLogPath: `${logDir}\\SafeChainUltimate.err`,
    };
  } else if (os === 'darwin') {
    const logDir = `/Library/Logs/AikidoSecurity/SafeChainUltimate`;
    return {
      logDir,
      proxyLogPath: `${logDir}/safechain-proxy.log`,
      ultimateLogPath: `${logDir}/safechain-ultimate.log`,
      proxyErrLogPath: `${logDir}/safechain-proxy.error.log`,
      ultimateErrLogPath: `${logDir}/safechain-ultimate.error.log`,
    };
  } else {
    throw new Error('Unsupported platform for log printing.');
  }
}

/**
 * @param {string} appName
 * @param {string} logPath
 * @param {string} errLogPath
 */
async function printLogs(appName, logPath, errLogPath) {
  ui.writeInformation(`=== ${appName} Logs ===`);
  try {
    if (existsSync(logPath)) {
      const logs = readFileSync(logPath, "utf-8");
      ui.writeInformation(logs);
    } else {
      ui.writeWarning(`${appName} log file not found: ${logPath}`);
    }
  } catch (error) {
    ui.writeError(`Failed to read ${appName} logs: ${error}`);
  }

  ui.writeInformation(`=== ${appName} Error Logs ===`);
  try {
    if (existsSync(errLogPath)) {
      const errLogs = readFileSync(errLogPath, "utf-8");
      ui.writeInformation(errLogs);
    } else {
      ui.writeInformation(`No error log file found for ${appName}.`);
    }
  } catch (error) {
    ui.writeError(`Failed to read ${appName} error logs: ${error}`);
  }
}
