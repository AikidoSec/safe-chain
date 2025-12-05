/**
 * @param {string[]} args
 * @returns {{name: string, version: string}[]}
 */
export function parsePackagesFromArguments(args) {
  const changes = [];
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
      changes.push(packageDetails);
    }
  }

  return changes;
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
  const optionsWithParameters = ["--C", "--dir"];

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
  // If the index is 0, it means the package name starts with "@" (eg: "@aikidosec/package-name")
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
