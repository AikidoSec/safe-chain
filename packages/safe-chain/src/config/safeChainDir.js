import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { getInstalledSafeChainDir } from "../installLocation.js";

/**
 * @returns {string}
 */
export function getSafeChainBaseDir() {
  return getInstalledSafeChainDir() ?? path.join(os.homedir(), ".safe-chain");
}

/**
 * @returns {string}
 */
export function getBinDir() {
  return path.join(getSafeChainBaseDir(), "bin");
}

/**
 * @returns {string}
 */
export function getShimsDir() {
  return path.join(getSafeChainBaseDir(), "shims");
}

/**
 * @returns {string}
 */
export function getScriptsDir() {
  return path.join(getSafeChainBaseDir(), "scripts");
}

/**
 * @returns {string}
 */
export function getCertsDir() {
  return path.join(getSafeChainBaseDir(), "certs");
}

/**
 * @param {string} moduleUrl
 * @param {string} fileName
 * @returns {string}
 */
export function getStartupScriptSourcePath(moduleUrl, fileName) {
  return path.join(path.dirname(fileURLToPath(moduleUrl)), "startup-scripts", fileName);
}

/**
 * @param {string} moduleUrl
 * @param {string} fileName
 * @returns {string}
 */
export function getPathWrapperTemplatePath(moduleUrl, fileName) {
  return path.join(path.dirname(fileURLToPath(moduleUrl)), "path-wrappers", "templates", fileName);
}
