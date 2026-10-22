import { resolvePackageVersion } from "../../../api/npmApi.js";
import { parsePackagesFromArguments } from "../parsing/parsePackagesFromArguments.js";
import { getNpmCustomRegistries } from "../../../config/settings.js";
import { ui } from "../../../environment/userInteraction.js";

/**
 * @returns {import("../../npm/dependencyScanner/commandArgumentScanner.js").CommandArgumentScanner}
 */
export function commandArgumentScanner() {
  return {
    scan: (args) => scanDependencies(args),
    shouldScan: () => true, // all npx commands need to be scanned, npx doesn't have dry-run
  };
}

/**
 * @param {string[]} args
 * @returns {Promise<import("../../npm/dependencyScanner/commandArgumentScanner.js").ScanResult[]>}
 */
function scanDependencies(args) {
  return checkChangesFromArgs(args);
}

/**
 * Known npm registries that are allowed by default
 */
const KNOWN_NPM_REGISTRIES = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "registry.npmjs.com",
];

/**
 * Normalizes a registry URL by removing protocol and trailing slashes
 * @param {string} registry
 * @returns {string}
 */
function normalizeRegistry(registry) {
  let normalized = registry;
  
  // Remove protocol
  normalized = normalized.replace(/^https?:\/\//, "");
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "");
  
  return normalized;
}

/**
 * Checks if a registry is allowed (known or configured)
 * @param {string} registry
 * @returns {boolean}
 */
function isRegistryAllowed(registry) {
  const normalized = normalizeRegistry(registry);
  const customRegistries = getNpmCustomRegistries();
  
  // Check against known registries
  if (KNOWN_NPM_REGISTRIES.some(known => normalized.includes(known))) {
    return true;
  }
  
  // Check against configured custom registries
  if (customRegistries.some(custom => normalized.includes(custom))) {
    return true;
  }
  
  return false;
}

/**
 * Checks if a package name is a URL or remote source
 * @param {string} packageName
 * @returns {boolean}
 */
function isRemoteSource(packageName) {
  // Check for URL protocols
  if (packageName.startsWith("http://") || 
      packageName.startsWith("https://") ||
      packageName.startsWith("git://") ||
      packageName.startsWith("git+ssh://") ||
      packageName.startsWith("git+https://") ||
      packageName.startsWith("git+http://")) {
    return true;
  }
  
  // Check for file: protocol (local tarballs)
  if (packageName.startsWith("file:")) {
    return true;
  }
  
  // Check for GitHub shorthand (user/repo)
  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(packageName)) {
    return true;
  }
  
  return false;
}

/**
 * @param {string[]} args
 * @returns {Promise<import("../../npm/dependencyScanner/commandArgumentScanner.js").ScanResult[]>}
 */
export async function checkChangesFromArgs(args) {
  const parseResult = parsePackagesFromArguments(args);
  
  // Validate registry if specified
  if (parseResult.registry) {
    if (!isRegistryAllowed(parseResult.registry)) {
      ui.writeError(
        `Safe-chain: Blocked npx execution from unrecognized registry: ${parseResult.registry}`
      );
      ui.writeInformation(
        `To use this registry, add it to your Safe Chain configuration:`
      );
      ui.writeInformation(
        `  - Set SAFE_CHAIN_NPM_CUSTOM_REGISTRIES environment variable, or`
      );
      ui.writeInformation(
        `  - Add it to your .safe-chain.json config file under npm.customRegistries`
      );
      throw new Error(
        `Alternate registry not in Safe Chain allow list: ${parseResult.registry}. ` +
        `Safe Chain cannot audit packages from unrecognized sources. ` +
        `Configure this registry in SAFE_CHAIN_NPM_CUSTOM_REGISTRIES or .safe-chain.json to proceed.`
      );
    }
  }
  
  const changes = [];
  const packageUpdates = parseResult.packages;

  for (const packageUpdate of packageUpdates) {
    // Block remote sources (URLs, git repos, etc.) that bypass registry auditing
    if (isRemoteSource(packageUpdate.name)) {
      ui.writeError(
        `Safe-chain: Blocked npx execution from remote source: ${packageUpdate.name}`
      );
      ui.writeInformation(
        `Safe Chain cannot audit packages executed directly from URLs, git repositories, or tarballs.`
      );
      ui.writeInformation(
        `Please execute packages from a configured npm registry instead.`
      );
      throw new Error(
        `Remote package source not supported: ${packageUpdate.name}. ` +
        `Safe Chain cannot audit packages from direct URLs, git repositories, or tarballs. ` +
        `Execute from a configured npm registry to ensure security scanning.`
      );
    }
    
    var exactVersion = await resolvePackageVersion(
      packageUpdate.name,
      packageUpdate.version
    );
    if (exactVersion) {
      packageUpdate.version = exactVersion;
    }

    changes.push({ ...packageUpdate, type: "add" });
  }

  return changes;
}
