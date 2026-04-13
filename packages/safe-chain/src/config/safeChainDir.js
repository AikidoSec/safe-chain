import os from "os";
import path from "path";
import { getInstalledSafeChainDir } from "../installLocation.js";

/**
 * @returns {string}
 */
export function getSafeChainBaseDir() {
  return getInstalledSafeChainDir() ?? path.join(os.homedir(), ".safe-chain");
}
