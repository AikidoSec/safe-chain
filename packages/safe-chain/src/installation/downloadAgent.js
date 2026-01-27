import { createWriteStream, createReadStream } from "fs";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import fetch from "make-fetch-happen";

const ULTIMATE_VERSION = "v0.2.2";

export const DOWNLOAD_URLS = {
  win32: {
    x64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-windows-amd64.msi`,
      checksum:
        "sha256:82d6939579c23c357d0f6d368001a5ac8dc66ce13d32ee1700467555ee97e10a",
    },
    arm64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-windows-arm64.msi`,
      checksum:
        "sha256:d626da40e3d0c4e02a36e6c7e309f18f0ffde64e97a4f2fefd4b25722842ac19",
    },
  },
  darwin: {
    x64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-darwin-amd64.pkg`,
      checksum:
        "sha256:d7c31914deff8b332bf3d0e18ed00660e47ace87f06f22606c7866f7e0809507",
    },
    arm64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-darwin-arm64.pkg`,
      checksum:
        "sha256:73b092689e00c98e3c376afa50fc3477cedfd01445a113d42b36c5fcd956a6f4",
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
