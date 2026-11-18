/**
 * @param {string[]} args
 *
 * @returns {{name: string, version: string}[]}
 */
export function parsePackagesFromArguments(args) {
  let defaultTag = "latest";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const option = getOption(arg);

    if (option) {
      // If the option has a parameter, skip the next argument as well
      i += option.numberOfParameters;

      continue;
    }

    const packageDetails = parsePackagename(arg, defaultTag);
    if (packageDetails) {
      return [packageDetails];
    }
  }

  return [];
}

/**
 * @param {string} arg
 * @returns {{name: string, numberOfParameters: number} | undefined}
 */
function getOption(arg) {
  if (isOptionWithParameter(arg)) {
    return {
      name: arg,
      numberOfParameters: 1,
    };
  }

  // Arguments starting with "-" or "--" are considered options
  // except for "--package=" which contains the package name
  if (arg.startsWith("-") && !arg.startsWith("--package=")) {
    return {
      name: arg,
      numberOfParameters: 0,
    };
  }

  return undefined;
}

/**
 * @param {string} arg
 * @returns {boolean}
 */
function isOptionWithParameter(arg) {
  const optionsWithParameters = [
    "--access",
    "--auth-type",
    "--cache",
    "--fetch-retries",
    "--fetch-retry-mintimeout",
    "--fetch-retry-maxtimeout",
    "--fetch-retry-factor",
    "--fetch-timeout",
    "--https-proxy",
    "--include",
    "--location",
    "--lockfile-version",
    "--loglevel",
    "--omit",
    "--proxy",
    "--registry",
    "--replace-registry-host",
    "--tag",
    "--user-config",
    "--workspace",
  ];

  return optionsWithParameters.includes(arg);
}

/**
 * @param {string} arg
 * @param {string} defaultTag
 * @returns {{name: string, version: string}}
 */
function parsePackagename(arg, defaultTag) {
  // format can be --package=name@version
  // in that case, we need to remove the --package= part
  if (arg.startsWith("--package=")) {
    arg = arg.slice(10);
  }

  arg = removeAlias(arg);

  // Split at the last "@" to separate the package name and version
  const lastAtIndex = arg.lastIndexOf("@");

  let name, version;
  // The index of the last "@" should be greater than 0
  // If the index is 0, it means the package name starts with "@" (eg: "@vercel/otel")
  if (lastAtIndex > 0) {
    name = arg.slice(0, lastAtIndex);
    version = arg.slice(lastAtIndex + 1);
  } else {
    name = arg;
    version = defaultTag; // No tag specified (eg: "http-server"), use the default tag
  }

  return {
    name,
    version,
  };
}

/**
 * @param {string} arg
 * @returns {string}
 */
function removeAlias(arg) {
  // removes the alias.
  // Eg.: server@npm:http-server@latest becomes http-server@latest
  const aliasIndex = arg.indexOf("@npm:");
  if (aliasIndex !== -1) {
    // Validate that this is actually an npm alias and not a URL or other format
    // containing "@npm:" in a query parameter or path.
    // An npm alias must have the format: alias@npm:package[@version]
    // The alias name must be a valid package name (not a URL, file path, etc.)
    const aliasName = arg.slice(0, aliasIndex);
    
    // Check if the part before @npm: looks like a valid package name
    // Valid package names:
    // - Don't contain protocol separators (://)
    // - Don't start with . or / (file paths)
    // - Don't contain URL-like patterns
    if (isValidPackageName(aliasName)) {
      return arg.slice(aliasIndex + 5);
    }
  }
  return arg;
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
