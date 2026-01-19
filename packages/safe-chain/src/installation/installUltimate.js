import { platform, arch, tmpdir } from "os";
import { createWriteStream, unlinkSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { pipeline } from "stream/promises";
import fetch from "make-fetch-happen";
import { ui } from "../environment/userInteraction.js";

const ULTIMATE_VERSION = "v0.2.0";

export function installUltimate() {
  const operatingSystem = platform();

  if (operatingSystem === "win32") {
    installOnWindows();
  } else {
    ui.writeInformation(
      `${operatingSystem} is not supported yet by safe-chain's ultimate version.`,
    );
  }
}

async function installOnWindows() {
  if (!isRunningAsAdmin()) {
    ui.writeError("Administrator privileges required.");
    ui.writeInformation(
      "Please run this command in an elevated terminal (Run as Administrator)."
    );
    return;
  }

  const architecture = getWindowsArchitecture();
  const downloadUrl = buildDownloadUrl(architecture);
  const msiPath = join(tmpdir(), `SafeChainAgent-${Date.now()}.msi`);

  ui.writeInformation(`Downloading SafeChain Agent ${ULTIMATE_VERSION} for ${architecture}...`);
  ui.writeVerbose(`Download URL: ${downloadUrl}`);
  ui.writeVerbose(`Destination: ${msiPath}`);
  await downloadFile(downloadUrl, msiPath);

  ui.writeInformation("Installing SafeChain Agent...");
  ui.writeVerbose(`Running: msiexec /i "${msiPath}" /qn`);
  runMsiInstaller(msiPath);

  ui.writeVerbose(`Cleaning up temporary file: ${msiPath}`);
  cleanup(msiPath);
  ui.writeInformation("SafeChain Agent installed successfully!");
}

function isRunningAsAdmin() {
  try {
    execSync("net session", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getWindowsArchitecture() {
  const nodeArch = arch();
  if (nodeArch === "x64") return "amd64";
  if (nodeArch === "arm64") return "arm64";
  throw new Error(`Unsupported architecture: ${nodeArch}`);
}

/**
 * @param {string} architecture
 */
function buildDownloadUrl(architecture) {
  return `https://github.com/AikidoSec/safechain-internals/releases/download/${ULTIMATE_VERSION}/SafeChainAgent-windows-${architecture}.msi`;
}

/**
 * @param {string} url
 * @param {string} destPath
 */
async function downloadFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`);
  }
  await pipeline(response.body, createWriteStream(destPath));
}

/**
 * @param {string} msiPath
 */
function runMsiInstaller(msiPath) {
  execSync(`msiexec /i "${msiPath}" /qn`, { stdio: "inherit" });
}

/**
 * @param {string} msiPath
 */
function cleanup(msiPath) {
  try {
    unlinkSync(msiPath);
  } catch {
    // Ignore cleanup errors
  }
}
