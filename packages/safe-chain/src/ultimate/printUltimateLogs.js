// @ts-nocheck
import { platform } from 'os';
import { ui } from "../environment/userInteraction.js";
import { readFileSync, existsSync } from "node:fs";

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

function getPathsPerPlatform() {
  const os = platform();
  if (os === 'win32') {
    const logDir = `C:\\ProgramData\\AikidoSecurity\\SafeChainUltimate\\logs`;
    return {
      proxyLogPath: `${logDir}\\SafeChainProxy.log`,
      ultimateLogPath: `${logDir}\\SafeChainUltimate.log`,
      proxyErrLogPath: `${logDir}\\SafeChainProxy.err`,
      ultimateErrLogPath: `${logDir}\\SafeChainUltimate.err`,
    };
  } else if (os === 'darwin') {
    const logDir = `/Library/Logs/AikidoSecurity/SafeChainUltimate`;
    return {
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
