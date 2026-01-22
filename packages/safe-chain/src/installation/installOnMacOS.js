import { tmpdir } from "os";
import { unlinkSync } from "fs";
import { join } from "path";
import { ui } from "../environment/userInteraction.js";
import { printVerboseAndSafeSpawn } from "../utils/safeSpawn.js";
import { downloadAgentToFile, getAgentVersion } from "./downloadAgent.js";
import chalk from "chalk";

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
    ui.writeInformation(
      chalk.cyan("🔐 ") +
        chalk.bold("ACTION REQUIRED: ") +
        "macOS will show a popup to install our certificate.",
    );
    ui.writeInformation(
      "   " +
        chalk.bold("Please accept the certificate") +
        " to complete the installation.",
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
  // Uses installer to install the package (https://ss64.com/mac/installer.html)
  // Options:
  //  -pkg (required):    The package to be installed.
  //  -target (required): The target volume is specified with the -target parameter.
  //                       --> "-target /" installs to the current boot volume.

  const result = await printVerboseAndSafeSpawn(
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
