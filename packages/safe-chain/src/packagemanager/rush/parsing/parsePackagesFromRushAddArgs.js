/**
 * @param {string[]} args
 * @returns {{name: string, version: string | null}[]}
 */
export function parsePackagesFromRushAddArgs(args) {
  const packageSpecs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--package" || arg === "-p") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        packageSpecs.push(next);
        i += 1;
      }
      continue;
    }

    if (arg.startsWith("--package=")) {
      const value = arg.slice("--package=".length);
      if (value) {
        packageSpecs.push(value);
      }
    }
  }

  return packageSpecs
    .map((spec) => parsePackageSpec(spec))
    .filter((spec) => spec !== null);
}

/**
 * @param {string} spec
 * @returns {{name: string, version: string | null} | null}
 */
function parsePackageSpec(spec) {
  const value = removeAlias(spec.trim());
  if (!value) {
    return null;
  }

  // Do not parse version from URLs or file paths
  // URLs should be treated as complete package identifiers
  if (isUrlOrFilePath(value)) {
    return {
      name: value,
      version: null,
    };
  }

  const lastAtIndex = value.lastIndexOf("@");
  if (lastAtIndex > 0) {
    return {
      name: value.slice(0, lastAtIndex),
      version: value.slice(lastAtIndex + 1),
    };
  }

  return {
    name: value,
    version: null,
  };
}

/**
 * @param {string} spec
 * @returns {string}
 */
function removeAlias(spec) {
  // Do not process URLs or file paths as aliases
  // URLs can contain @npm: in query strings or fragments, which would cause
  // a security vulnerability where the audited package differs from what rush installs
  if (isUrlOrFilePath(spec)) {
    return spec;
  }
  
  const aliasIndex = spec.indexOf("@npm:");
  if (aliasIndex !== -1) {
    // Validate that @npm: appears in a valid alias position
    // Valid: "alias@npm:package@version" where aliasIndex > 0
    // Invalid: "@npm:package@version" (aliasIndex === 0, not a valid alias)
    // Invalid: URLs containing @npm: in query/fragment
    if (aliasIndex === 0) {
      // @npm: at the start is not a valid alias syntax
      return spec;
    }
    
    // Additional validation: ensure there's a valid package name after @npm:
    const afterNpm = spec.slice(aliasIndex + 5);
    if (afterNpm.length === 0) {
      return spec;
    }
    
    return afterNpm;
  }

  return spec;
}

/**
 * @param {string} spec
 * @returns {boolean}
 */
function isUrlOrFilePath(spec) {
  // Check for common URL schemes and file paths
  // This prevents processing URLs that might contain @npm: in query strings
  return (
    spec.startsWith("http://") ||
    spec.startsWith("https://") ||
    spec.startsWith("file:") ||
    spec.startsWith("git://") ||
    spec.startsWith("git+") ||
    spec.startsWith("github:") ||
    spec.startsWith("gitlab:") ||
    spec.startsWith("bitbucket:") ||
    spec.startsWith("/") ||
    spec.startsWith("./") ||
    spec.startsWith("../")
  );
}
