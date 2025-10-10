import fs from "fs";
import os from "os";
import path from "path";

const logFileName = path.join(os.homedir(), ".safe-chain", "proxy.log");

function logProxyMessage(message) {
  try {
    const logDir = path.dirname(logFileName);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    fs.appendFileSync(logFileName, logEntry, { encoding: "utf8" });
  } catch {
    // No-op
  }
}

export function logProxyError(error) {
  logProxyMessage(`ERROR: ${error.message}\n${error.stack}`);
}

export function logProxyInfo(info) {
  logProxyMessage(`INFO:  ${info}`);
}
