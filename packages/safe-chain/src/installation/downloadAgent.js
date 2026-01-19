import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import fetch from "make-fetch-happen";

const ULTIMATE_VERSION = "v0.2.0";

/**
 * @typedef {"windows"} Platform
 * @typedef {"amd64" | "arm64"} Architecture
 */

/**
 * Builds the download URL for the SafeChain Agent installer.
 * @param {Platform} platform
 * @param {Architecture} architecture
 */
export function getAgentDownloadUrl(platform, architecture) {
  const extension = platform === "windows" ? "msi" : "pkg";
  return `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainAgent-${platform}-${architecture}.${extension}`;
}

/**
 * Downloads a file from a URL to a local path.
 * @param {string} url
 * @param {string} destPath
 */
export async function downloadFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`);
  }
  await pipeline(response.body, createWriteStream(destPath));
}

/**
 * Returns the current agent version.
 */
export function getAgentVersion() {
  return ULTIMATE_VERSION;
}
