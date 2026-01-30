import { platform } from 'os';
import { ui } from "../environment/userInteraction.js";
import { readFileSync, existsSync } from "node:fs";
import {randomUUID} from "node:crypto";
import {createWriteStream} from "fs";
import archiver from 'archiver';
import path from "node:path";

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

export async function collectLogs() {
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
    const output = createWriteStream(zipFileName);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      ui.writeInformation(`Logs collected and zipped as: ${path.resolve(zipFileName)}`);
      resolve(zipFileName);
    });

    archive.on('error', (err) => {
      ui.writeError(`Failed to zip logs: ${err.message}`);
      reject(err);
    });

    archive.pipe(output);
    archive.directory(logDir, false);
    archive.finalize();
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
    ui.writeError(`Failed to read ${appName} logs: ${error.message}`);
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
    ui.writeError(`Failed to read ${appName} error logs: ${error.message}`);
  }
}
