import { createWriteStream, createReadStream } from "fs";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import fetch from "make-fetch-happen";

const ULTIMATE_VERSION = "v1.0.0";

export const DOWNLOAD_URLS = {
  win32: {
    x64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-windows-amd64.msi`,
      checksum:
        "sha256:c6a36f9b8e55ab6b7e8742cbabc4469d85809237c0f5e6c21af20b36c416ee1d",
    },
    arm64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-windows-arm64.msi`,
      checksum:
        "sha256:46acd1af6a9938ea194c8ee8b34ca9b47c8de22e088a0791f3c0751dd6239c90",
    },
  },
  darwin: {
    x64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-darwin-amd64.pkg`,
      checksum:
        "sha256:bb1829e8ca422e885baf37bef08dcbe7df7a30f248e2e89c4071564f7d4f3396",
    },
    arm64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-darwin-arm64.pkg`,
      checksum:
        "sha256:7fe4a785709911cc366d8224b4c290677573b8c4833bd9054768299e55c5f0ed",
    },
  },
};

/**
 * Builds the download URL for the SafeChain Agent installer.
 * @param {string} fileName
 */
export function getAgentDownloadUrl(fileName) {
  return `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/${fileName}`;
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

/**
 * Returns download info (url, checksum) for the current OS and architecture.
 * @returns {{ url: string, checksum: string } | null}
 */
export function getDownloadInfoForCurrentPlatform() {
  const platform = process.platform;
  const arch = process.arch;

  if (!Object.hasOwn(DOWNLOAD_URLS, platform)) {
    return null;
  }
  const platformUrls =
    DOWNLOAD_URLS[/** @type {keyof typeof DOWNLOAD_URLS} */ (platform)];

  if (!Object.hasOwn(platformUrls, arch)) {
    return null;
  }

  return platformUrls[/** @type {keyof typeof platformUrls} */ (arch)];
}

/**
 * Verifies the checksum of a file.
 * @param {string} filePath
 * @param {string} expectedChecksum - Format: "algorithm:hash" (e.g., "sha256:abc123...")
 * @returns {Promise<boolean>}
 */
export async function verifyChecksum(filePath, expectedChecksum) {
  const [algorithm, expected] = expectedChecksum.split(":");

  const hash = createHash(algorithm);

  if (filePath.includes("..")) throw new Error("Invalid file path");
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  const actual = hash.digest("hex");
  return actual === expected;
}

/**
 * Downloads the SafeChain agent for the current OS/arch and verifies its checksum.
 * @param {string} fileName - Destination file path
 * @returns {Promise<string | null>} The file path if successful, null if no download URL for current platform
 */
export async function downloadAgentToFile(fileName) {
  const info = getDownloadInfoForCurrentPlatform();
  if (!info) {
    return null;
  }

  await downloadFile(info.url, fileName);

  const isValid = await verifyChecksum(fileName, info.checksum);
  if (!isValid) {
    throw new Error("Checksum verification failed");
  }

  return fileName;
}
