import { ui } from "../environment/userInteraction.js";

/**
 * @type {{loggingLevel: string | undefined, skipMinimumPackageAge: boolean | undefined, minimumPackageAgeHours: string | undefined}}
 */
const state = {
  loggingLevel: undefined,
  skipMinimumPackageAge: undefined,
  minimumPackageAgeHours: undefined,
};

const SAFE_CHAIN_ARG_PREFIX = "--safe-chain-";
const SAFE_CHAIN_ENV_PREFIX = "SAFE_CHAIN_";
const ENV_BOOL_TRUE_VALUES = ["1", "true", "yes"];
/**
 * 
 * @param {unknown} value 
 * @returns {boolean}
 */
const isEnvBoolTrue = (value) => !!value && ENV_BOOL_TRUE_VALUES.includes(String(value).toLowerCase());
/**
 * @param {string[]} args
 * @returns {string[]}
 */
export function initializeCliArguments(args) {
  // Reset state on each call
  state.loggingLevel = undefined;
  state.skipMinimumPackageAge = undefined;
  state.minimumPackageAgeHours = undefined;

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
  setMinimumPackageAgeHours(safeChainArgs);
  checkDeprecatedPythonFlag(args);
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
 * @returns {void}
 */
function setLoggingLevel(args) {
  // First, check environment variable
  const envValue = process.env[SAFE_CHAIN_ENV_PREFIX + "LOGGING"];
  if (envValue) {
    state.loggingLevel = envValue.toLowerCase();
  }

  // CLI flag overrides environment variable
  const cliValue = getLastArgEqualsValue(args, SAFE_CHAIN_ARG_PREFIX + "logging=");
  if (cliValue) {
    state.loggingLevel = cliValue.toLowerCase();
  }
}

export function getLoggingLevel() {
  return state.loggingLevel;
}

/**
 * @param {string[]} args
 * @returns {void}
 */
function setSkipMinimumPackageAge(args) {
  // First, check environment variable
  const envValue = process.env[SAFE_CHAIN_ENV_PREFIX + "SKIP_MINIMUM_PACKAGE_AGE"];
  if (isEnvBoolTrue(envValue)) {
    state.skipMinimumPackageAge = true;
  }

  // CLI flag overrides (always sets to true when present)
  if (hasFlagArg(args, SAFE_CHAIN_ARG_PREFIX + "skip-minimum-package-age")) {
    state.skipMinimumPackageAge = true;
  }
}

export function getSkipMinimumPackageAge() {
  return state.skipMinimumPackageAge;
}

/**
 * @param {string[]} args
 * @returns {void}
 */
function setMinimumPackageAgeHours(args) {
  const argName = SAFE_CHAIN_ARG_PREFIX + "minimum-package-age-hours=";

  const value = getLastArgEqualsValue(args, argName);
  if (value) {
    state.minimumPackageAgeHours = value;
  }
}

/**
 * @returns {string | undefined}
 */
export function getMinimumPackageAgeHours() {
  return state.minimumPackageAgeHours;
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
 * Emits a deprecation warning for legacy --include-python flag
 *
 * @param {string[]} args
 * @returns {void}
 */
export function checkDeprecatedPythonFlag(args) {
  if (hasFlagArg(args, "--include-python")) {
    ui.writeWarning(
      "--include-python is deprecated and ignored. Python tooling is included by default."
    );
  }
}
