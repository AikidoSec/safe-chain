import fs from "fs";
import path from "path";
import os from "os";

/**
 * Get the path to the proxy state file
 * @returns {string}
 */
export function getProxyStateFilePath() {
  const homeDir = os.homedir();
  const safeChainDir = path.join(homeDir, ".safe-chain");
  
  // Ensure directory exists
  if (!fs.existsSync(safeChainDir)) {
    fs.mkdirSync(safeChainDir, { recursive: true });
  }
  
  return path.join(safeChainDir, "proxy-state.json");
}

/**
 * Write the proxy state to a file that shell scripts can read
 * @param {{port: number, url: string, pid: number, ecosystem: string, certPath: string}} state
 */
export function writeProxyState(state) {
  const statePath = getProxyStateFilePath();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Read the current proxy state
 * @returns {{port: number, url: string, pid: number, ecosystem: string, certPath: string} | null}
 */
export function readProxyState() {
  const statePath = getProxyStateFilePath();
  
  if (!fs.existsSync(statePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(statePath, "utf-8");
    const state = JSON.parse(content);
    
    // Verify the process is still running
    if (state.pid) {
      try {
        // Sending signal 0 checks if process exists without actually sending a signal
        process.kill(state.pid, 0);
        return state;
      } catch {
        // Process doesn't exist, clean up state file
        clearProxyState();
        return null;
      }
    }
    
    return state;
  } catch {
    return null;
  }
}

/**
 * Clear the proxy state file
 */
export function clearProxyState() {
  const statePath = getProxyStateFilePath();
  
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
}

/**
 * Check if a proxy is currently running
 * @returns {boolean}
 */
export function isProxyRunning() {
  const state = readProxyState();
  return state !== null;
}
