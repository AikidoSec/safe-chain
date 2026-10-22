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
  const aliasIndex = spec.indexOf("@npm:");
  if (aliasIndex !== -1) {
    // Validate that this is actually an npm alias and not a URL or other format
    // containing "@npm:" in a query parameter or path.
    // An npm alias must have the format: alias@npm:package[@version]
    // The alias name must be a valid package name (not a URL, file path, etc.)
    const aliasName = spec.slice(0, aliasIndex);
    
    // Check if the part before @npm: looks like a valid package name
    // Valid package names:
    // - Don't contain protocol separators (://)
    // - Don't start with . or / (file paths)
    // - Don't contain URL-like patterns
    if (isValidPackageName(aliasName)) {
      return spec.slice(aliasIndex + 5);
    }
  }

  return spec;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isValidPackageName(name) {
  if (!name) {
    return false;
  }
  
  // Reject URLs (http://, https://, git://, etc.)
  if (name.includes("://")) {
    return false;
  }
  
  // Reject file paths
  if (name.startsWith("./") || name.startsWith("../") || name.startsWith("/")) {
    return false;
  }
  
  // Reject Windows-style paths
  if (/^[a-zA-Z]:/.test(name)) {
    return false;
  }
  
  // Reject file: protocol
  if (name.startsWith("file:")) {
    return false;
  }
  
  return true;
}
