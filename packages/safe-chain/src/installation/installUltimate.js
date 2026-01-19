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
      "Please run this command in an elevated terminal (Run as Administrator).",
    );
    return;
  }

  const architecture = getWindowsArchitecture();
  const downloadUrl = buildDownloadUrl(architecture);
  const msiPath = join(tmpdir(), `SafeChainAgent-${Date.now()}.msi`);

  ui.writeInformation(
    `Downloading SafeChain Agent ${ULTIMATE_VERSION} for ${architecture}...`,
  );
  ui.writeVerbose(`Download URL: ${downloadUrl}`);
  ui.writeVerbose(`Destination: ${msiPath}`);
  await downloadFile(downloadUrl, msiPath);

  stopServiceIfRunning();
  uninstallIfInstalled();

  // Wait a moment for uninstall to complete
  await new Promise((resolve) => setTimeout(resolve, 2000));

  ui.writeInformation("Installing SafeChain Agent...");
  ui.writeVerbose(`Running: msiexec /i "${msiPath}" /qn /norestart`);
  runMsiInstaller(msiPath);

  ui.writeInformation("Starting SafeChain Agent service...");
  startService();

  ui.writeVerbose(`Cleaning up temporary file: ${msiPath}`);
  cleanup(msiPath);
  ui.writeInformation("SafeChain Agent installed and started successfully!");
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

function uninstallIfInstalled() {
  try {
    ui.writeInformation("Uninstalling existing SafeChain Agent...");
    ui.writeVerbose('Running: wmic product where "name=\'SafeChain Agent\'" call uninstall /nointeractive');
    execSync('wmic product where "name=\'SafeChain Agent\'" call uninstall /nointeractive', { stdio: "inherit" });
  } catch {
    // Not installed or uninstall failed, which is fine for a fresh install
    ui.writeVerbose("No existing SafeChain Agent installation found.");
  }
}

/**
 * @param {string} msiPath
 */
function runMsiInstaller(msiPath) {
  // /i = install
  // /qn = quiet mode (no UI)
  // /norestart = suppress restarts
  execSync(`msiexec /i "${msiPath}" /qn /norestart`, { stdio: "inherit" });
}

function stopServiceIfRunning() {
  try {
    ui.writeInformation("Stopping existing SafeChain Agent service...");
    ui.writeVerbose('Running: net stop "SafeChainAgent"');
    execSync('net stop "SafeChainAgent"', { stdio: "inherit" });
  } catch {
    // Service is not running or doesn't exist, which is fine
    ui.writeVerbose("SafeChain Agent service not running or not installed.");
  }
}

function startService() {
  ui.writeVerbose('Running: net start "SafeChainAgent"');
  execSync('net start "SafeChainAgent"', { stdio: "inherit" });
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
