import { arch, tmpdir } from "os";
import { unlinkSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { ui } from "../environment/userInteraction.js";
import {
  getAgentDownloadUrl,
  getAgentVersion,
  downloadFile,
} from "./downloadAgent.js";

export async function installOnWindows() {
  if (!isRunningAsAdmin()) {
    ui.writeError("Administrator privileges required.");
    ui.writeInformation(
      "Please run this command in an elevated terminal (Run as Administrator).",
    );
    return;
  }

  const architecture = getWindowsArchitecture();
  const downloadUrl = getAgentDownloadUrl("windows", architecture);
  const msiPath = join(tmpdir(), `SafeChainAgent-${Date.now()}.msi`);

  ui.emptyLine();
  ui.writeInformation(
    `📥 Downloading SafeChain Agent ${getAgentVersion()} (${architecture})...`,
  );
  ui.writeVerbose(`Download URL: ${downloadUrl}`);
  ui.writeVerbose(`Destination: ${msiPath}`);
  await downloadFile(downloadUrl, msiPath);

  ui.emptyLine();
  stopServiceIfRunning();
  uninstallIfInstalled();

  // Wait a moment for uninstall to complete
  await new Promise((resolve) => setTimeout(resolve, 2000));

  ui.writeInformation("⚙️  Installing SafeChain Agent...");
  runMsiInstaller(msiPath);

  ui.emptyLine();
  ui.writeInformation("🚀 Starting SafeChain Agent service...");
  startService();

  ui.writeVerbose(`Cleaning up temporary file: ${msiPath}`);
  cleanup(msiPath);

  ui.emptyLine();
  ui.writeInformation("✅ SafeChain Agent installed and started successfully!");
  ui.emptyLine();
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

function uninstallIfInstalled() {
  try {
    // Use PowerShell to find the product code, then use msiexec to uninstall
    // This is the modern alternative to wmic which is deprecated
    const findProductCodeCmd = `powershell -Command "$app = Get-WmiObject -Class Win32_Product -Filter \\"Name='SafeChain Agent'\\"; if ($app) { Write-Output $app.IdentifyingNumber }"`;
    ui.writeVerbose(`Finding product code: ${findProductCodeCmd}`);

    const productCode = execSync(findProductCodeCmd, {
      encoding: "utf8",
    }).trim();

    if (productCode) {
      ui.writeInformation("🗑️  Removing previous installation...");
      ui.writeVerbose(`Found product code: ${productCode}`);
      ui.writeVerbose(`Running: msiexec /x ${productCode} /qn /norestart`);
      execSync(`msiexec /x ${productCode} /qn /norestart`, {
        stdio: "inherit",
      });
    } else {
      ui.writeVerbose("No existing installation found (fresh install).");
    }
  } catch {
    // Not installed or uninstall failed, which is fine for a fresh install
    ui.writeVerbose("No existing installation found (fresh install).");
  }
}

/**
 * @param {string} msiPath
 */
function runMsiInstaller(msiPath) {
  // /i = install
  // /qn = quiet mode (no UI)
  ui.writeVerbose(`Running: msiexec /i "${msiPath}" /qn`);
  execSync(`msiexec /i "${msiPath}" /qn`, { stdio: "inherit" });
}

function stopServiceIfRunning() {
  try {
    ui.writeInformation("⏹️  Stopping running service...");
    ui.writeVerbose('Running: net stop "SafeChainAgent"');
    execSync('net stop "SafeChainAgent"', { stdio: "inherit" });
  } catch {
    // Service is not running or doesn't exist, which is fine
    ui.writeVerbose("Service not running (will start after installation).");
  }
}

function startService() {
  try {
    // Check if service is already running
    ui.writeVerbose('Checking service status: sc query "SafeChainAgent"');
    const status = execSync('sc query "SafeChainAgent"', { encoding: "utf8" });

    if (status.includes("RUNNING")) {
      ui.writeVerbose("SafeChain Agent service is already running.");
      return;
    }
  } catch {
    // Service might not exist yet or query failed, proceed with start
  }

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
