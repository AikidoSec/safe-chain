/**
 * @typedef {Object} PackageDetail
 * @property {string} name
 * @property {string} version
 * @property {string} type
 */

/**
 * @typedef {Object} PipOption
 * @property {string} name
 * @property {number} numberOfParameters
 */

/**
 * Supported formats that will be returned:
 * - package_name (no version)
 * - package_name==version (exact version)
 * - package_name===version (exact version, PEP 440)
 *
 * Ranges: Because they don't specify an exact version, the following formats are skipped and we rely on the MITM scanner:
 * - package_name>=version
 * - package_name<=version
 * - package_name>version
 * - package_name<version
 * - package_name~=version
 * - package_name!=version
 * - git+https://... (VCS URLs)
 * - -r requirements.txt (handled by flag skipping)
 *
 * @param {string[]} args
 * @returns {PackageDetail[]}
 */
export function parsePackagesFromInstallArgs(args) {
  /** @type {PackageDetail[]} */
  const packages = [];
  let skipNext = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (skipNext) {
      skipNext = false;
      continue;
    }

    // Skip the command itself (install, etc.)
    if (i === 0 && !arg.startsWith("-")) {
      continue;
    }

    // Skip flags and their values
    if (arg.startsWith("-")) {
      if (isPipOptionWithParameter(arg)) {
        skipNext = true;
      }
      continue;
    }

    const parsed = parsePipSpec(arg);
    if (parsed) {
      packages.push({ ...parsed, type: "add" });
    }
  }

  return packages;
}

/**
 * @param {string} arg
 * @returns {boolean}
 */
function isPipOptionWithParameter(arg) {

  // Check if a pip flag takes a parameter
  const optionsWithParameters = [
    // Install options
    "-r",
    "--requirement",
    "-c",
    "--constraint",
    "-e",
    "--editable",
    "-t",
    "--target",
    "--platform",
    "--python-version",
    "--implementation",
    "--abi",
    "--root",
    "--prefix",
    "--src",
    "--upgrade-strategy",
    "--progress-bar",
    "--root-user-action",
    "--report",
    "--group",
    // Package index options
    "-i",
    "--index-url",
    "--extra-index-url",
    "-f",
    "--find-links",
    // General options
    "--python",
    "--log",
    "--keyring-provider",
    "--proxy",
    "--retries",
    "--timeout",
    "--exists-action",
    "--trusted-host",
    "--cert",
    "--client-cert",
    "--cache-dir",
    "--use-feature",
    "--use-deprecated",
    "--resume-retries",
  ];

  return optionsWithParameters.includes(arg);
}

/**
 * @param {string} spec
 * @returns {{ name: string, version: string } | null}
 */
function parsePipSpec(spec) {
  // Ignore obvious URLs and paths, rely on mitm scanner
  const lower = spec.toLowerCase();
  if (
    lower.startsWith("git+") ||
    lower.startsWith("hg+") ||
    lower.startsWith("svn+") ||
    lower.startsWith("bzr+") ||
    lower.startsWith("http:") ||
    lower.startsWith("https:") ||
    lower.startsWith("file:") ||
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec.startsWith("/")
  ) {
    return null;
  }

  // Strip extras: package[extra1,extra2]
  const extrasStart = spec.indexOf("[");
  const extrasEnd = extrasStart >= 0 ? spec.indexOf("]", extrasStart) : -1;
  let base = spec;
  if (extrasStart >= 0 && extrasEnd > extrasStart) {
    base = spec.slice(0, extrasStart) + spec.slice(extrasEnd + 1);
  }

  // Split on first occurrence of a comparator or comma spec
  // Support multi-constraint lists like ">=1,<2" by detecting the first comparator
  const comparatorRegex = /(===|==|!=|~=|>=|<=|<|>)/;
  const m = base.match(comparatorRegex);
  if (!m) {
    // No comparator => just a name, use "latest" as version
    return { name: base, version: "latest" };
  }

  const idx = m.index;
  const name = base.slice(0, idx);
  const versionPart = base.slice(idx); // e.g. '==2.28.0' or '>=1,<2'

  // Normalize whitespace inside versionPart
  const versionWithOperator = versionPart.replace(/\s+/g, "");
  
  // Only return packages with exact version specifiers (== or ===)
  // Skip range specifiers (<, >, <=, >=, ~=, !=) since they don't provide a specific version
  if (!versionWithOperator.startsWith("==")) {
    return null;
  }
  
  // Strip the == or === operator to get just the version number
  const version = versionWithOperator.replace(/^===?/, "");
  
  return { name, version };
}
