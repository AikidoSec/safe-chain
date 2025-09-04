import { doesExecutableExistOnSystem } from "../helpers.js";
import { updateTOMLFile, removeScannerFromTOMLSection } from "../toml-utils.js";
import { execSync } from "child_process";
import path from "path";
import os from "os";

const packageManagerName = "Bun";
const executableName = "bun";

function isInstalled() {
  return doesExecutableExistOnSystem(executableName);
}

function setup() {
  try {
    // 1. Try to ensure safe-chain is installed globally in bun
    // This might fail, but we shouldn't let it prevent TOML configuration
    try {
      ensureSafeChainInstalled();
    } catch {
      // Package installation failed, but we'll continue with TOML setup
      // Users can install the package manually later
    }

    // 2. Setup aikido safe-chain as the security scanner in .bunfig.toml
    // This should always succeed regardless of package installation
    configureBunfigToml();

    return true;
  } catch {
    return false;
  }
}

function teardown() {
  try {
    // Remove scanner configuration from ..bunfig.toml
    removeBunfigConfiguration();
    return true;
  } catch {
    return false;
  }
}

function ensureSafeChainInstalled() {
  try {
    // Check if safe-chain is already installed globally in bun
    const result = execSync("bun pm ls -g", {
      encoding: "utf8",
      stdio: "pipe",
    });

    // If safe-chain is not found in the global list, install it
    if (!result.includes("@aikidosec/safe-chain")) {
      execSync("bun add -g @aikidosec/safe-chain", {
        encoding: "utf8",
        stdio: "inherit",
      });
    }
  } catch (error) {
    throw new Error(
      `Failed to ensure safe-chain is installed in bun: ${error.message}`
    );
  }
}

function configureBunfigToml() {
  const bunfigPath = path.join(os.homedir(), ".bunfig.toml");

  updateTOMLFile(bunfigPath, {
    "install.security": {
      scanner: "@aikidosec/safe-chain",
    },
  });
}

function removeBunfigConfiguration() {
  const bunfigPath = path.join(os.homedir(), ".bunfig.toml");
  removeScannerFromTOMLSection(bunfigPath, "@aikidosec/safe-chain");
}

export default {
  name: packageManagerName,
  isInstalled,
  setup,
  teardown,
};
