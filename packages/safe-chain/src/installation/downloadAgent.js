import { createWriteStream, createReadStream } from "fs";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import fetch from "make-fetch-happen";

const ULTIMATE_VERSION = "v0.2.3";

export const DOWNLOAD_URLS = {
  win32: {
    x64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-windows-amd64.msi`,
      checksum:
        "sha256:bd196ae05b876588f828a57c4d19b3e7ad96ba40007cf2b36693dc6e792d28cc",
    },
    arm64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-windows-arm64.msi`,
      checksum:
        "sha256:79e046f24405e869494291e77c6d8640c8dc58d2ac1db87d3038e9eb8afbdc8b",
    },
  },
  darwin: {
    x64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-darwin-amd64.pkg`,
      checksum:
        "sha256:99868cb663eef44d063d995d2dcc063f55b10eb719ee945d05fe8cf5fef5e2a5",
    },
    arm64: {
      url: `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainUltimate-darwin-arm64.pkg`,
      checksum:
        "sha256:000b334c2eb85d8692be5d23af73f8b9fb686c9db726992223187b341ea79306",
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
