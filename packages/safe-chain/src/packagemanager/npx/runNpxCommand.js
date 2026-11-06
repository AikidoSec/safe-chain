import { safeSpawn } from "../../utils/safeSpawn.js";
import { mergeSafeChainProxyEnvironmentVariables } from "../../registryProxy/registryProxy.js";
import { reportCommandExecutionFailure } from "../_shared/commandErrors.js";
import { parsePackagesFromArguments } from "./parsing/parsePackagesFromArguments.js";
import { getAuditedVersion } from "./dependencyScanner/commandArgumentScanner.js";

/**
 * Pins the package version in the arguments to ensure npx executes the audited version
 * @param {string[]} args
 * @returns {string[]}
 */
function pinPackageVersions(args) {
  const packageUpdates = parsePackagesFromArguments(args);
  
  // If no packages were found or no audited versions exist, return original args
  if (packageUpdates.length === 0) {
    return args;
  }

  const pinnedArgs = [];
  let packagePinned = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Remove --no-install flag to prevent execution of unaudited local packages
    // Even with version pinning, --no-install would use a local package that might be tampered
    if (arg === "--no-install" || arg === "--no") {
      continue; // Skip this flag
    }
    
    // Handle --package=name or --package=name@version format
    if (arg.startsWith("--package=")) {
      const packageSpec = arg.slice(10);
      const pinnedSpec = pinPackageSpec(packageSpec, packageUpdates);
      pinnedArgs.push("--package=" + pinnedSpec);
      if (pinnedSpec !== packageSpec) {
        packagePinned = true;
      }
      continue;
    }
    
    // Handle -p or --package with next argument
    if ((arg === "-p" || arg === "--package") && i + 1 < args.length) {
      pinnedArgs.push(arg);
      i++;
      const packageSpec = args[i];
      const pinnedSpec = pinPackageSpec(packageSpec, packageUpdates);
      pinnedArgs.push(pinnedSpec);
      if (pinnedSpec !== packageSpec) {
        packagePinned = true;
      }
      continue;
    }
    
    // Skip flags
    if (arg.startsWith("-")) {
      pinnedArgs.push(arg);
      continue;
    }
    
    // This might be the package specification (first non-flag argument)
    if (!packagePinned) {
      const pinnedSpec = pinPackageSpec(arg, packageUpdates);
      pinnedArgs.push(pinnedSpec);
      if (pinnedSpec !== arg) {
        packagePinned = true;
      }
      continue;
    }
    
    // All other arguments pass through unchanged
    pinnedArgs.push(arg);
  }

  return pinnedArgs;
}

/**
 * Pins a package specification to the audited version if available
 * @param {string} packageSpec - The package specification (e.g., "http-server" or "http-server@1.0.0")
 * @param {Array<{name: string, version: string}>} packageUpdates - Parsed package information
 * @returns {string} - The pinned package specification
 */
function pinPackageSpec(packageSpec, packageUpdates) {
  // Remove alias prefix if present (e.g., "server@npm:http-server" -> "http-server")
  let spec = packageSpec;
  const aliasIndex = spec.indexOf("@npm:");
  let aliasPrefix = "";
  if (aliasIndex !== -1) {
    aliasPrefix = spec.slice(0, aliasIndex + 5);
    spec = spec.slice(aliasIndex + 5);
  }

  // Find matching package in packageUpdates
  for (const pkg of packageUpdates) {
    // Check if this spec matches the package name
    if (spec === pkg.name || spec.startsWith(pkg.name + "@")) {
      const auditedVersion = getAuditedVersion(pkg.name);
      if (auditedVersion) {
        // Pin to the audited version
        return aliasPrefix + pkg.name + "@" + auditedVersion;
      }
    }
  }

  return packageSpec;
}

/**
 * @param {string[]} args
 *
 * @returns {Promise<{status: number}>}
 */
export async function runNpx(args) {
  try {
    // Pin package versions to ensure we execute the audited version
    const pinnedArgs = pinPackageVersions(args);
    
    const result = await safeSpawn("npx", pinnedArgs, {
      stdio: "inherit",
      env: mergeSafeChainProxyEnvironmentVariables(process.env),
    });
    return { status: result.status };
  } catch (/** @type any */ error) {
    return reportCommandExecutionFailure(error, "npx");
  }
}
