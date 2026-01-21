import { createWriteStream, createReadStream } from "fs";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import fetch from "make-fetch-happen";

const ULTIMATE_VERSION = "v0.2.0";

const DOWNLOAD_URLS = {
  win32: {
    x64: {
      url: "https://github.com/AikidoSec/safechain-internals/releases/download/v0.0.2-macos-release-artifact/SafeChainAgent-windows-amd64.msi",
      checksum:
        "sha256:bba5deb250ebc6008f1cb33fa4209d2455a2f47fa99f0a40e3babef64939ac77",
    },
    arm64: {
      url: "https://github.com/AikidoSec/safechain-internals/releases/download/v0.0.2-macos-release-artifact/SafeChainAgent-windows-arm64.msi",
      checksum:
        "sha256:9553ed15d5efed4185b990a1b86af0b11c23f11d96f8ce04e16b6b98aaf0506e",
    },
  },
  darwin: {
    x64: {
      url: "https://github.com/AikidoSec/safechain-internals/releases/download/v0.0.2-macos-release-artifact/SafeChainAgent-darwin-amd64.pkg",
      checksum:
        "sha256:cbccf32e987a45bc8cc20b620f7b597ff7f9c2f966c2bc21132349612ddb619f",
    },
    arm64: {
      url: "https://github.com/AikidoSec/safechain-internals/releases/download/v0.0.2-macos-release-artifact/SafeChainAgent-darwin-arm64.pkg",
      checksum:
        "sha256:4d53a43a47bf7e8133eb61d306a1fb16348b9ec89c1c825e5f746f4fe847796e",
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
async function verifyChecksum(filePath, expectedChecksum) {
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
