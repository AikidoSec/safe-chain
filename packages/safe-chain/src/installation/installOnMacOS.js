import { tmpdir } from "os";
import { unlinkSync } from "fs";
import { join } from "path";
import { ui } from "../environment/userInteraction.js";
import { safeSpawn } from "../utils/safeSpawn.js";
import { downloadAgentToFile, getAgentVersion } from "./downloadAgent.js";

const MACOS_SERVICE_LABEL = "com.aikido.SafeChainAgent";

export async function installOnMacOS() {
  if (!isRunningAsRoot()) {
    ui.writeError("Root privileges required.");
    ui.writeInformation("Please run this command with sudo:");
    ui.writeInformation("  sudo safe-chain --ultimate");
    return;
  }

  const pkgPath = join(tmpdir(), `SafeChainUltimate-${Date.now()}.pkg`);

  ui.emptyLine();
  ui.writeInformation(`📥 Downloading SafeChain Ultimate ${getAgentVersion()}`);
  ui.writeVerbose(`Destination: ${pkgPath}`);

  const result = await downloadAgentToFile(pkgPath);
  if (!result) {
    ui.writeError("No download available for this platform/architecture.");
    return;
  }

  try {
    ui.writeInformation("⚙️  Installing SafeChain Ultimate...");
    await runPkgInstaller(pkgPath);

    ui.emptyLine();
    ui.writeInformation(
      "✅ SafeChain Ultimate installed and started successfully!",
    );
    ui.emptyLine();
  } finally {
    ui.writeVerbose(`Cleaning up temporary file: ${pkgPath}`);
    cleanup(pkgPath);
  }
}

function isRunningAsRoot() {
  const rootUserUid = 0;
  return process.getuid?.() === rootUserUid;
}

/**
 * @param {string} pkgPath
 */
async function runPkgInstaller(pkgPath) {
  ui.writeVerbose(`Running: installer -pkg "${pkgPath}" -target /`);

  const result = await safeSpawn(
    "installer",
    ["-pkg", pkgPath, "-target", "/"],
    {
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error(`PKG installer failed (exit code: ${result.status})`);
  }
}

/**
 * @param {string} pkgPath
 */
function cleanup(pkgPath) {
  try {
    unlinkSync(pkgPath);
  } catch {
    ui.writeVerbose("Failed to clean up temporary installer file.");
  }
}
