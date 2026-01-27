import { tmpdir } from "os";
import { unlinkSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { ui } from "../environment/userInteraction.js";
import { printVerboseAndSafeSpawn, safeSpawn } from "../utils/safeSpawn.js";
import { downloadAgentToFile, getAgentVersion } from "./downloadAgent.js";

const WINDOWS_SERVICE_NAME = "SafeChainUltimate";
const WINDOWS_APP_NAME = "SafeChain Ultimate";

export async function uninstallOnWindows() {
  if (!(await isRunningAsAdmin())) {
    ui.writeError("Administrator privileges required.");
    ui.writeInformation(
      "Please run this command in an elevated terminal (Run as Administrator).",
    );
    return;
  }

  ui.emptyLine();

  const productCode = getInstalledProductCode();
  if (!productCode) {
    ui.writeInformation("SafeChain Ultimate is not installed.");
    return;
  }

  await stopServiceIfRunning();

  ui.writeInformation("🗑️  Uninstalling SafeChain Ultimate...");
  await uninstallByProductCode(productCode);

  ui.emptyLine();
  ui.writeInformation("✅ SafeChain Ultimate has been uninstalled.");
  ui.emptyLine();
}

export async function installOnWindows() {
  if (!(await isRunningAsAdmin())) {
    ui.writeError("Administrator privileges required.");
    ui.writeInformation(
      "Please run this command in an elevated terminal (Run as Administrator).",
    );
    return;
  }

  const msiPath = join(tmpdir(), `SafeChainUltimate-${Date.now()}.msi`);

  ui.emptyLine();
  ui.writeInformation(`📥 Downloading SafeChain Ultimate ${getAgentVersion()}`);
  ui.writeVerbose(`Destination: ${msiPath}`);

  const result = await downloadAgentToFile(msiPath);
  if (!result) {
    ui.writeError("No download available for this platform/architecture.");
    return;
  }

  try {
    ui.emptyLine();
    await stopServiceIfRunning();
    await uninstallIfInstalled();

    ui.writeInformation("⚙️  Installing SafeChain Ultimate...");
    await runMsiInstaller(msiPath);

    ui.emptyLine();
    ui.writeInformation(
      "✅ SafeChain Ultimate installed and started successfully!",
    );
    ui.emptyLine();
  } finally {
    ui.writeVerbose(`Cleaning up temporary file: ${msiPath}`);
    cleanup(msiPath);
  }
}

async function isRunningAsAdmin() {
  // Uses Windows Security API to check if current process has admin privileges.
  // Returns "True" or "False" as a string.
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

/**
 * Returns the MSI product code for SafeChain Ultimate, or null if not installed.
 * @returns {string | null}
 */
function getInstalledProductCode() {
  // Query Win32_Product via WMI to find the installed SafeChain Agent.
  // If found, outputs the product GUID (e.g., "{12345678-1234-...}") needed for msiexec uninstall.
  ui.writeVerbose(`Finding product code with PowerShell`);

  let productCode;
  try {
    productCode = execSync(
      `powershell -Command "$app = Get-WmiObject -Class Win32_Product -Filter \\"Name='${WINDOWS_APP_NAME}'\\"; if ($app) { Write-Output $app.IdentifyingNumber }"`,
      { encoding: "utf8" },
    ).trim();
  } catch {
    return null;
  }
  return productCode || null;
}

/**
 * @param {string} productCode
 */
async function uninstallByProductCode(productCode) {
  ui.writeVerbose(`Found product code: ${productCode}`);

  // Use msiexec to run the msi installer quitely (https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/msiexec)
  // Options:
  //  - /x:         Uninstalls the package.
  //  - /qn:        Specifies there's no UI during the installation process.
  //  - /norestart: Stops the device from restarting after the installation completes.
  const uninstallResult = await printVerboseAndSafeSpawn(
    "msiexec",
    ["/x", productCode, "/qn", "/norestart"],
    { stdio: "inherit" },
  );

  if (uninstallResult.status !== 0) {
    throw new Error(`Uninstall failed (exit code: ${uninstallResult.status})`);
  }
}

async function uninstallIfInstalled() {
  const productCode = getInstalledProductCode();
  if (!productCode) {
    ui.writeVerbose("No existing installation found (fresh install).");
    return;
  }

  ui.writeInformation("🗑️  Removing previous installation...");
  await uninstallByProductCode(productCode);
}

/**
 * @param {string} msiPath
 */
async function runMsiInstaller(msiPath) {
  // Use msiexec to run the msi installer quitely (https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/msiexec)
  // Options:
  //  - /i:  Specifies normal installation
  //  - /qn: Specifies there's no UI during the installation process.

  const result = await printVerboseAndSafeSpawn(
    "msiexec",
    ["/i", msiPath, "/qn"],
    {
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error(`MSI installer failed (exit code: ${result.status})`);
  }
}

async function stopServiceIfRunning() {
  ui.writeInformation("⏹️  Stopping running service...");

  const result = await printVerboseAndSafeSpawn(
    "net",
    ["stop", WINDOWS_SERVICE_NAME],
    {
      stdio: "pipe",
    },
  );

  if (result.status !== 0) {
    ui.writeVerbose("Service not running (will start after installation).");
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
