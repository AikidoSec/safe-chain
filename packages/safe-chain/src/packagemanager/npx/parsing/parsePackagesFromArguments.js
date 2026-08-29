/**
 * @param {string[]} args
 *
 * @returns {{name: string, version: string}[]}
 */
export function parsePackagesFromArguments(args) {
  let defaultTag = "latest";

  // Packages explicitly requested via --package / -p. npx allows this flag to be
  // specified multiple times, so every occurrence must be collected and scanned.
  const explicitPackages = [];
  // The first positional (non-option) argument, used only as a fallback when no
  // explicit --package flag is present.
  let positionalPackage = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const option = getOption(arg);

    if (option) {
      // --package=x is handled by parsePackagename below; other options may
      // consume a following parameter that must be skipped.
      if (!isPackageOption(arg)) {
        i += option.numberOfParameters;
        continue;
      }
    }

    if (isPackageFlag(arg)) {
      // "--package x" / "-p x" form: the package name is the next argument.
      const next = args[i + 1];
      if (next !== undefined) {
        const packageDetails = parsePackagename(next, defaultTag);
        if (packageDetails) {
          explicitPackages.push(packageDetails);
        }
        i += 1;
      }
      continue;
    }

    if (arg.startsWith("--package=")) {
      // "--package=x" form.
      const packageDetails = parsePackagename(arg, defaultTag);
      if (packageDetails) {
        explicitPackages.push(packageDetails);
      }
      continue;
    }

    const packageDetails = parsePackagename(arg, defaultTag);
    if (packageDetails && positionalPackage === undefined) {
      positionalPackage = packageDetails;
    }
  }

  if (explicitPackages.length > 0) {
    return explicitPackages;
  }

  if (positionalPackage !== undefined) {
    return [positionalPackage];
  }

  return [];
}

/**
 * @param {string} arg
 * @returns {boolean}
 */
function isPackageFlag(arg) {
  return arg === "--package" || arg === "-p";
}

/**
 * @param {string} arg
 * @returns {boolean}
 */
function isPackageOption(arg) {
  return isPackageFlag(arg) || arg.startsWith("--package=");
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
    return arg.slice(aliasIndex + 5);
  }
  return arg;
}
