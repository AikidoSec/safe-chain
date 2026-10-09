/**
 * @param {string[]} args
 * @returns {{name: string, version: string}[]}
 */
export function parsePackagesFromArguments(args) {
  const changes = [];
  let defaultTag = "latest";

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const option = getOption(arg);

    if (option) {
      // If the option has a parameter, skip the next argument as well
      i += option.numberOfParameters;

      continue;
    }

    const packageDetails = parsePackagename(arg, defaultTag);
    if (packageDetails) {
      changes.push(packageDetails);
    }
  }

  return changes;
}

/**
 * @param {string} arg
 *
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
  if (arg.startsWith("-")) {
    return {
      name: arg,
      numberOfParameters: 0,
    };
  }

  return undefined;
}

/**
 * @param {string} arg
 *
 * @returns {boolean}
 */
function isOptionWithParameter(arg) {
  const optionsWithParameters = [
    "--use-yarnrc",
    "--link-folder",
    "--global-folder",
    "--modules-folder",
    "--preferred-cache-folder",
    "--cache-folder",
    "--mutex",
    "--cwd",
    "--proxy",
    "--https-proxy",
    "--registry",
    "--network-concurrency",
    "--network-timeout",
    "--scripts-prepend-node-path",
    "--otp",
  ];

  return optionsWithParameters.includes(arg);
}

/**
 * @param {string} arg
 * @param {string} defaultTag
 *
 * @returns {{name: string, version: string}}
 */
function parsePackagename(arg, defaultTag) {
  // format can be --package=name@version
  // in that case, we need to remove the --package= part
  if (arg.startsWith("--package=")) {
    arg = arg.slice(10);
  }

  arg = removeAlias(arg);

  // Do not parse version from URLs or file paths
  // URLs should be treated as complete package identifiers
  if (isUrlOrFilePath(arg)) {
    return {
      name: arg,
      version: defaultTag,
    };
  }

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
  
  // Do not process URLs or file paths as aliases
  // URLs can contain @npm: in query strings or fragments, which would cause
  // a security vulnerability where the audited package differs from what yarn installs
  if (isUrlOrFilePath(arg)) {
    return arg;
  }
  
  const aliasIndex = arg.indexOf("@npm:");
  if (aliasIndex !== -1) {
    // Validate that @npm: appears in a valid alias position
    // Valid: "alias@npm:package@version" where aliasIndex > 0
    // Invalid: "@npm:package@version" (aliasIndex === 0, not a valid alias)
    // Invalid: URLs containing @npm: in query/fragment
    if (aliasIndex === 0) {
      // @npm: at the start is not a valid alias syntax
      return arg;
    }
    
    // Additional validation: ensure there's a valid package name after @npm:
    const afterNpm = arg.slice(aliasIndex + 5);
    if (afterNpm.length === 0) {
      return arg;
    }
    
    return afterNpm;
  }
  return arg;
}

/**
 * @param {string} arg
 * @returns {boolean}
 */
function isUrlOrFilePath(arg) {
  // Check for common URL schemes and file paths
  // This prevents processing URLs that might contain @npm: in query strings
  return (
    arg.startsWith("http://") ||
    arg.startsWith("https://") ||
    arg.startsWith("file:") ||
    arg.startsWith("git://") ||
    arg.startsWith("git+") ||
    arg.startsWith("github:") ||
    arg.startsWith("gitlab:") ||
    arg.startsWith("bitbucket:") ||
    arg.startsWith("/") ||
    arg.startsWith("./") ||
    arg.startsWith("../")
  );
}
