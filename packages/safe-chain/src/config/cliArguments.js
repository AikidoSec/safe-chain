/**
 * @type {{loggingLevel: string | undefined, skipMinimumPackageAge: boolean | undefined}}
 */
const state = {
  loggingLevel: undefined,
  skipMinimumPackageAge: undefined,
};

const SAFE_CHAIN_ARG_PREFIX = "--safe-chain-";

/**
 * @param {string[]} args
 * @returns {string[]}
 */
export function initializeCliArguments(args) {
  // Reset state on each call
  state.loggingLevel = undefined;
  state.skipMinimumPackageAge = undefined;

  const safeChainArgs = [];
  const remainingArgs = [];

  for (const arg of args) {
    if (arg.toLowerCase().startsWith(SAFE_CHAIN_ARG_PREFIX)) {
      safeChainArgs.push(arg);
    } else {
      remainingArgs.push(arg);
    }
  }

  setLoggingLevel(safeChainArgs);
  setSkipMinimumPackageAge(safeChainArgs);

  return remainingArgs;
}

/**
 * @param {string[]} args
 * @param {string} prefix
 * @returns {string | undefined}
 */
function getLastArgEqualsValue(args, prefix) {
  for (var i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    if (arg.toLowerCase().startsWith(prefix)) {
      return arg.substring(prefix.length);
    }
  }

  return undefined;
}

/**
 * @param {string[]} args
 * @param {string} flagName
 * @returns {boolean}
 */
function hasFlagArg(args, flagName) {
  for (const arg of args) {
    if (arg.toLowerCase() === flagName.toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string[]} args
 * @returns {void}
 */
function setLoggingLevel(args) {
  const safeChainLoggingArg = SAFE_CHAIN_ARG_PREFIX + "logging=";

  const level = getLastArgEqualsValue(args, safeChainLoggingArg);
  if (!level) {
    return;
  }
  state.loggingLevel = level.toLowerCase();
}

export function getLoggingLevel() {
  return state.loggingLevel;
}

/**
 * @param {string[]} args
 * @returns {void}
 */
function setSkipMinimumPackageAge(args) {
  const flagName = SAFE_CHAIN_ARG_PREFIX + "skip-minimum-package-age";

  if (hasFlagArg(args, flagName)) {
    state.skipMinimumPackageAge = true;
  }
}

export function getSkipMinimumPackageAge() {
  return state.skipMinimumPackageAge;
}
