/**
 * @typedef {Object} PackageDetail
 * @property {string} name
 * @property {string} version
 */

/**
 * @typedef {Object} NpmOption
 * @property {string} name
 * @property {number} numberOfParameters
 */

/**
 * @param {string[]} args
 * @returns {PackageDetail[]}
 */
export function parsePackagesFromInstallArgs(args) {
  /** @type {{name: string, version: string | null}[]} */
  const changes  = [];
  let defaultTag = "latest";

  // Skip first argument (install command)
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const npmOption = getNpmOption(arg);

    if (npmOption) {
      // If the option has a parameter, skip the next argument as well
      i += npmOption.numberOfParameters;

      // it a tag is specified, set the default tag
      if (npmOption.name === "--tag") {
        defaultTag = args[i];
      }

      continue;
    }

    const packageDetails = parsePackagename(arg);
    if (packageDetails) {
      changes.push(packageDetails);
      continue;
    }
  }

  for (const change of changes) {
    if (!change.version) {
      change.version = defaultTag;
    }
  }

  return /** @type {PackageDetail[]} */ (changes);
}

/**
 * @param {string} arg
 * @returns {NpmOption | undefined}
 */
function getNpmOption(arg) {
  if (isNpmOptionWithParameter(arg)) {
    return {
      name: arg,
      numberOfParameters: 1,
    };
  }

  // Arguments starting with "-" or "--" are considered npm options
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
 * @returns {boolean}
 */
function isNpmOptionWithParameter(arg) {
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
 * @returns {{name: string, version: string | null}}
 */
function parsePackagename(arg) {
  arg = removeAlias(arg);
  const lastAtIndex = arg.lastIndexOf("@");

  let name, version;
  // The index of the last "@" should be greater than 0
  // If the index is 0, it means the package name starts with "@" (eg: "@vercel/otel")
  if (lastAtIndex > 0) {
    name = arg.slice(0, lastAtIndex);
    version = arg.slice(lastAtIndex + 1);
  } else {
    name = arg;
    version = null;
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
  const aliasIndex = arg.indexOf("@npm:");
  if (aliasIndex !== -1) {
    return arg.slice(aliasIndex + 5);
  }
  return arg;
}
