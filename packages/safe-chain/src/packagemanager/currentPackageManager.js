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
import { createPipPackageManager } from "./pip/createPackageManager.js";
import { createUvPackageManager } from "./uv/createUvPackageManager.js";

/**
 * @type {{packageManagerName: PackageManager | null}}
 */
const state = {
  packageManagerName: null,
};

/**
 * @typedef {Object} GetDependencyUpdatesResult
 * @property {string} name
 * @property {string} version
 * @property {string} type
 */

/**
 * @typedef {Object} PackageManager
 * @property {(args: string[]) => Promise<{ status: number }>} runCommand
 * @property {(args: string[]) => boolean} isSupportedCommand
 * @property {(args: string[]) => Promise<GetDependencyUpdatesResult[]> | GetDependencyUpdatesResult[]} getDependencyUpdatesForCommand
 */

/**
 * @param {string} packageManagerName
 *
 * @return {PackageManager}
 */
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
  } else if (packageManagerName === "pip") {
    state.packageManagerName = createPipPackageManager();
  } else if (packageManagerName === "uv") {
    state.packageManagerName = createUvPackageManager();
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
