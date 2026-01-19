import { arch, tmpdir } from "os";
import { unlinkSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
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

  try {
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

    ui.emptyLine();
    ui.writeInformation(
      "✅ SafeChain Agent installed and started successfully!",
    );
    ui.emptyLine();
  } finally {
    ui.writeVerbose(`Cleaning up temporary file: ${msiPath}`);
    cleanup(msiPath);
  }
}

async function isRunningAsAdmin() {
  const result = await safeSpawn(
    "powershell",
    [
      "-Command",
      "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
    ],
    { stdio: "pipe" },
  );

  return result.status === 0 && result.stdout.trim() === "True";
}

function getWindowsArchitecture() {
  const nodeArch = arch();
  if (nodeArch === "x64") return "amd64";
  if (nodeArch === "arm64") return "arm64";
  throw new Error(`Unsupported architecture: ${nodeArch}`);
}

async function uninstallIfInstalled() {
  ui.writeVerbose(`Finding product code with PowerShell`);

  let productCode;
  try {
    productCode = execSync(
      `powershell -Command "$app = Get-WmiObject -Class Win32_Product -Filter \\"Name='SafeChain Agent'\\"; if ($app) { Write-Output $app.IdentifyingNumber }"`,
      { encoding: "utf8" },
    ).trim();
  } catch {
    ui.writeVerbose("No existing installation found (fresh install).");
    return;
  }
  if (!productCode) {
    ui.writeVerbose("No existing installation found (fresh install).");
    return;
  }

  ui.writeInformation("🗑️  Removing previous installation...");
  ui.writeVerbose(`Found product code: ${productCode}`);

  const uninstallResult = await safeSpawn(
    "msiexec",
    ["/x", productCode, "/qn", "/norestart"],
    { stdio: "inherit" },
  );

  if (uninstallResult.status !== 0) {
    ui.writeInformation(uninstallResult.stdout);
    ui.writeInformation(uninstallResult.stderr);
    throw new Error(`Uninstall failed (exit code: ${uninstallResult.status})`);
  }
}

/**
 * @param {string} msiPath
 */
async function runMsiInstaller(msiPath) {
  ui.writeVerbose(`Running: msiexec /i "${msiPath}" /qn`);

  const result = await safeSpawn("msiexec", ["/i", msiPath, "/qn"], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`MSI installer failed (exit code: ${result.status})`);
  }
}

async function stopServiceIfRunning() {
  ui.writeInformation("⏹️  Stopping running service...");

  const result = await safeSpawn("net", ["stop", "SafeChainAgent"], {
    stdio: "pipe",
  });

  if (result.status !== 0) {
    ui.writeVerbose("Service not running (will start after installation).");
  }
}

async function startService() {
  ui.writeVerbose('Checking service status: sc query "SafeChainAgent"');
  const queryResult = await safeSpawn("sc", ["query", "SafeChainAgent"], {
    stdio: "pipe",
  });

  if (queryResult.status === 0 && queryResult.stdout.includes("RUNNING")) {
    ui.writeVerbose("SafeChain Agent service is already running.");
    return;
  }

  ui.writeVerbose('Running: net start "SafeChainAgent"');
  const startResult = await safeSpawn("net", ["start", "SafeChainAgent"], {
    stdio: "pipe",
  });

  if (startResult.status !== 0) {
    throw new Error(
      `Failed to start service (exit code: ${startResult.status})`,
    );
  }
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
