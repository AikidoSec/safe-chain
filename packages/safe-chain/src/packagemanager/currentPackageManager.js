import {
  createBunPackageManager,
  createBunxPackageManager,
} from "./bun/createBunPackageManager.js";
import { createNpmPackageManager } from "./npm/createPackageManager.js";
import { createNpxPackageManager } from "./npx/createPackageManager.js";
import {
  createPnpmPackageManager,
  createPnpxPackageManager,
} from "./pnpm/createPackageManager.js";
import { createYarnPackageManager } from "./yarn/createPackageManager.js";

const state = {
  packageManagerName: null,
};

export function initializePackageManager(packageManagerName) {
  if (packageManagerName === "npm") {
    state.packageManagerName = createNpmPackageManager();
  } else if (packageManagerName === "npx") {
    state.packageManagerName = createNpxPackageManager();
  } else if (packageManagerName === "yarn") {
    state.packageManagerName = createYarnPackageManager();
  } else if (packageManagerName === "pnpm") {
    state.packageManagerName = createPnpmPackageManager();
  } else if (packageManagerName === "pnpx") {
    state.packageManagerName = createPnpxPackageManager();
  } else if (packageManagerName === "bun") {
    state.packageManagerName = createBunPackageManager();
  } else if (packageManagerName === "bunx") {
    state.packageManagerName = createBunxPackageManager();
  } else {
    throw new Error("Unsupported package manager: " + packageManagerName);
  }

  return state.packageManagerName;
}

export function getPackageManager() {
  if (!state.packageManagerName) {
    throw new Error("Package manager not initialized.");
  }
  return state.packageManagerName;
}
