import fs from "fs";
import path from "path";

/**
 * @typedef {Object} PnpmWorkspaceSettings
 * @property {number | undefined} minimumReleaseAgeMinutes
 * @property {string[]} minimumReleaseAgeExclude
 */

/** @returns {PnpmWorkspaceSettings} */
function emptySettings() {
  return {
    minimumReleaseAgeMinutes: undefined,
    minimumReleaseAgeExclude: [],
  };
}

/** @type {{ resolved: boolean, value: PnpmWorkspaceSettings }} */
const cache = {
  resolved: false,
  value: emptySettings(),
};

/**
 * Resets the cached pnpm workspace settings. Intended for tests.
 */
export function resetPnpmWorkspaceConfigCache() {
  cache.resolved = false;
  cache.value = emptySettings();
}

/**
 * Walks up from `process.cwd()` looking for the nearest `pnpm-workspace.yaml`,
 * falling back to a `pnpm` field inside `package.json`. Returns parsed settings
 * the first time it is called and caches the result for the process lifetime.
 *
 * @returns {PnpmWorkspaceSettings}
 */
export function getPnpmWorkspaceSettings() {
  if (cache.resolved) {
    return cache.value;
  }
  cache.resolved = true;

  const found = findPnpmConfig(process.cwd());
  if (found) {
    cache.value = found;
  }
  return cache.value;
}

/**
 * The minimum release age (in hours) declared by the nearest pnpm workspace
 * config, or undefined if not declared.
 *
 * @returns {number | undefined}
 */
export function getMinimumReleaseAgeHours() {
  const { minimumReleaseAgeMinutes } = getPnpmWorkspaceSettings();
  if (minimumReleaseAgeMinutes === undefined) {
    return undefined;
  }
  return minimumReleaseAgeMinutes / 60;
}

/**
 * @returns {string[]}
 */
export function getMinimumReleaseAgeExclusions() {
  return getPnpmWorkspaceSettings().minimumReleaseAgeExclude;
}

/**
 * @param {string} startDir
 * @returns {PnpmWorkspaceSettings | undefined}
 */
function findPnpmConfig(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const workspacePath = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(workspacePath)) {
      const parsed = safeParseYaml(workspacePath);
      if (parsed) {
        return parsed;
      }
    }

    const packageJsonPath = path.join(dir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const parsed = safeParsePackageJsonPnpmField(packageJsonPath);
      if (parsed) {
        return parsed;
      }
      // package.json exists but has no pnpm field — keep walking up; in a
      // pnpm monorepo the relevant config lives at the workspace root.
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * @param {string} filePath
 * @returns {PnpmWorkspaceSettings | undefined}
 */
function safeParseYaml(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
  return parsePnpmWorkspaceYaml(content);
}

/**
 * @param {string} filePath
 * @returns {PnpmWorkspaceSettings | undefined}
 */
function safeParsePackageJsonPnpmField(filePath) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
  if (!pkg || typeof pkg !== "object" || !pkg.pnpm || typeof pkg.pnpm !== "object") {
    return undefined;
  }
  return {
    minimumReleaseAgeMinutes: validatePositiveNumber(pkg.pnpm.minimumReleaseAge),
    minimumReleaseAgeExclude: validateStringArray(pkg.pnpm.minimumReleaseAgeExclude),
  };
}

/**
 * Minimal YAML parser scoped to the keys we read from `pnpm-workspace.yaml`:
 * `minimumReleaseAge` (numeric scalar) and `minimumReleaseAgeExclude`
 * (block or flow list of strings). All other top-level keys are ignored.
 *
 * @param {string} content
 * @returns {PnpmWorkspaceSettings}
 */
export function parsePnpmWorkspaceYaml(content) {
  /** @type {PnpmWorkspaceSettings} */
  const result = {
    minimumReleaseAgeMinutes: undefined,
    minimumReleaseAgeExclude: [],
  };

  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = stripYamlComment(rawLine);

    if (line.trim() === "" || isTopLevelIndented(rawLine)) {
      i++;
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z_][\w-]*)\s*:(.*)$/);
    if (!keyMatch) {
      i++;
      continue;
    }

    const key = keyMatch[1];
    const rest = keyMatch[2].trim();

    if (key === "minimumReleaseAge") {
      result.minimumReleaseAgeMinutes = parseScalarNumber(rest);
      i++;
      continue;
    }

    if (key === "minimumReleaseAgeExclude") {
      if (rest.startsWith("[")) {
        result.minimumReleaseAgeExclude = parseFlowArray(rest);
        i++;
        continue;
      }
      const { items, nextIndex } = parseBlockArray(lines, i + 1);
      result.minimumReleaseAgeExclude = items;
      i = nextIndex;
      continue;
    }

    i++;
  }

  return result;
}

/**
 * @param {string} line
 * @returns {string}
 */
function stripYamlComment(line) {
  // Strip `#` comments that aren't inside quotes. Pnpm's settings here are
  // simple keys/values, so a quote-aware scan is enough.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === "#" && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * @param {string} rawLine
 * @returns {boolean}
 */
function isTopLevelIndented(rawLine) {
  return /^[ \t]/.test(rawLine);
}

/**
 * @param {string} value
 * @returns {number | undefined}
 */
function parseScalarNumber(value) {
  if (!value) return undefined;
  const unquoted = unquote(value);
  const num = Number(unquoted);
  if (Number.isNaN(num) || num < 0) {
    return undefined;
  }
  return num;
}

/**
 * @param {string} flowText
 * @returns {string[]}
 */
function parseFlowArray(flowText) {
  const closing = flowText.indexOf("]");
  if (closing === -1) return [];
  const inner = flowText.slice(1, closing);
  return inner
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter((item) => item.length > 0);
}

/**
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {{ items: string[], nextIndex: number }}
 */
function parseBlockArray(lines, startIndex) {
  const items = [];
  let i = startIndex;
  while (i < lines.length) {
    const rawLine = lines[i];
    const stripped = stripYamlComment(rawLine);
    if (stripped.trim() === "") {
      i++;
      continue;
    }

    const itemMatch = stripped.match(/^\s+-\s+(.*)$/);
    if (itemMatch) {
      const value = unquote(itemMatch[1].trim());
      if (value.length > 0) {
        items.push(value);
      }
      i++;
      continue;
    }

    // Non-empty, non-list line — the block list has ended.
    break;
  }
  return { items, nextIndex: i };
}

/**
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function validatePositiveNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return undefined;
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function validateStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.length > 0);
}
