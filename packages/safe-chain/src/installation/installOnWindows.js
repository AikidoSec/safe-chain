import { arch, tmpdir } from "os";
import { unlinkSync } from "fs";
import { join } from "path";
import { ui } from "../environment/userInteraction.js";
import { safeSpawn } from "../utils/safeSpawn.js";
import {
  getAgentDownloadUrl,
  getAgentVersion,
  downloadFile,
} from "./downloadAgent.js";

export async function installOnWindows() {
  if (!(await isRunningAsAdmin())) {
    ui.writeError("Administrator privileges required.");
    ui.writeInformation(
      "Please run this command in an elevated terminal (Run as Administrator).",
    );
    return;
  }

  const architecture = getWindowsArchitecture();
  const fileName = `SafeChainAgent-windows-${architecture}.msi`;
  const downloadUrl = getAgentDownloadUrl(fileName);
  const msiPath = join(tmpdir(), `SafeChainAgent-${Date.now()}.msi`);

  ui.emptyLine();
  ui.writeInformation(
    `📥 Downloading SafeChain Agent ${getAgentVersion()} (${architecture})...`,
  );
  ui.writeVerbose(`Download URL: ${downloadUrl}`);
  ui.writeVerbose(`Destination: ${msiPath}`);
  await downloadFile(downloadUrl, msiPath);

  ui.emptyLine();
  await stopServiceIfRunning();
  await uninstallIfInstalled();

  // Wait a moment for uninstall to complete
  await new Promise((resolve) => setTimeout(resolve, 2000));

  ui.writeInformation("⚙️  Installing SafeChain Agent...");
  await runMsiInstaller(msiPath);

  ui.emptyLine();
  ui.writeInformation("🚀 Starting SafeChain Agent service...");
  await startService();

  ui.writeVerbose(`Cleaning up temporary file: ${msiPath}`);
  cleanup(msiPath);

  ui.emptyLine();
  ui.writeInformation("✅ SafeChain Agent installed and started successfully!");
  ui.emptyLine();
}

async function isRunningAsAdmin() {
  const result = await safeSpawn("net", ["session"], { stdio: "ignore" });
  return result.status === 0;
}

function getWindowsArchitecture() {
  const nodeArch = arch();
  if (nodeArch === "x64") return "amd64";
  if (nodeArch === "arm64") return "arm64";
  throw new Error(`Unsupported architecture: ${nodeArch}`);
}

async function uninstallIfInstalled() {
  // Use PowerShell to find the product code, then use msiexec to uninstall
  // This is the modern alternative to wmic which is deprecated
  const powershellScript = `$app = Get-WmiObject -Class Win32_Product -Filter "Name='SafeChain Agent'"; if ($app) { Write-Output $app.IdentifyingNumber }`;
  ui.writeVerbose(`Finding product code with PowerShell`);

  const result = await safeSpawn("powershell", ["-Command", powershellScript], {
    stdio: "pipe",
  });

  if (result.status !== 0) {
    ui.writeVerbose("No existing installation found (fresh install).");
    return;
  }

  const productCode = result.stdout.trim();

  if (!productCode) {
    ui.writeVerbose("No existing installation found (fresh install).");
    return;
  }

  ui.writeInformation("🗑️  Removing previous installation...");
  ui.writeVerbose(`Found product code: ${productCode}`);
  ui.writeVerbose(`Running: msiexec /x ${productCode} /qn /norestart`);
  await safeSpawn("msiexec", ["/x", productCode, "/qn", "/norestart"], {
    stdio: "inherit",
  });
}

/**
 * @param {string} msiPath
 */
async function runMsiInstaller(msiPath) {
  // /i = install
  // /qn = quiet mode (no UI)
  ui.writeVerbose(`Running: msiexec /i "${msiPath}" /qn`);
  await safeSpawn("msiexec", ["/i", msiPath, "/qn"], { stdio: "inherit" });
}

async function stopServiceIfRunning() {
  ui.writeInformation("⏹️  Stopping running service...");
  ui.writeVerbose('Running: net stop "SafeChainAgent"');
  const result = await safeSpawn("net", ["stop", "SafeChainAgent"], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    ui.writeVerbose("Service not running (will start after installation).");
  }
}

async function startService() {
  // Check if service is already running
  ui.writeVerbose('Checking service status: sc query "SafeChainAgent"');
  const queryResult = await safeSpawn("sc", ["query", "SafeChainAgent"], {
    stdio: "pipe",
  });

  if (queryResult.status === 0 && queryResult.stdout.includes("RUNNING")) {
    ui.writeVerbose("SafeChain Agent service is already running.");
    return;
  }

  if (queryResult.status !== 0) {
    ui.writeVerbose("Service not found or query failed, attempting to start.");
  }

  ui.writeVerbose('Running: net start "SafeChainAgent"');
  await safeSpawn("net", ["start", "SafeChainAgent"], { stdio: "inherit" });
}

/**
 * @param {string} msiPath
 */
function cleanup(msiPath) {
  try {
    unlinkSync(msiPath);
  } catch {
    ui.writeVerbose("Failed to clean up temporary installer file.");
  }
}
