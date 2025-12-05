import { spawn, execSync } from "child_process";
import os from "os";

/**
 * @param {string} arg
 *
 * @returns {string}
 */
function sanitizeShellArgument(arg) {
  // If argument contains shell metacharacters, wrap in double quotes
  // and escape characters that are special even inside double quotes
  if (hasShellMetaChars(arg)) {
    // Inside double quotes, we need to escape: " $ ` \
    return '"' + escapeDoubleQuoteContent(arg) + '"';
  }
  return arg;
}

/**
 * @param {string} arg
 *
 * @returns {boolean}
 */
function hasShellMetaChars(arg) {
  // Shell metacharacters that need escaping
  // These characters have special meaning in shells and need to be quoted
  // Whenever one of these characters is present, we should quote the argument
  // Characters: space, ", &, ', |, ;, <, >, (, ), $, `, \, !, *, ?, [, ], {, }, ~, #
  const shellMetaChars = /[ "&'|;<>()$`\\!*?[\]{}~#]/;
  return shellMetaChars.test(arg);
}

/**
 * @param {string} arg
 *
 * @returns {string}
 */
function escapeDoubleQuoteContent(arg) {
  // Escape special characters for shell safety
  // This escapes ", $, `, and \ by prefixing them with a backslash
  return arg.replace(/(["`$\\])/g, "\\$1");
}

/**
 * @param {string} command
 * @param {string[]} args
 *
 * @returns {string}
 */
function buildCommand(command, args) {
  if (args.length === 0) {
    return command;
  }

  const escapedArgs = args.map(sanitizeShellArgument);

  return `${command} ${escapedArgs.join(" ")}`;
}

/**
 * @param {string} command
 *
 * @returns {string}
 */
function resolveCommandPath(command) {
  // command will be "npm", "yarn", etc.
  // Use 'command -v' to find the full path
  const fullPath = execSync(`command -v ${command}`, {
    encoding: "utf8",
  }).trim();

  if (!fullPath) {
    throw new Error(`Command not found: ${command}`);
  }

  return fullPath;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("child_process").SpawnOptions} options
 *
 * @returns {Promise<{status: number, stdout: string, stderr: string}>}
 */
export async function safeSpawn(command, args, options = {}) {
  // The command is always one of our supported package managers.
  // It should always be alphanumeric or _ or -
  // Reject any command names with suspicious characters
  if (!/^[a-zA-Z0-9_-]+$/.test(command)) {
    throw new Error(`Invalid command name: ${command}`);
  }

  return new Promise((resolve, reject) => {
    // Windows requires shell: true because .bat and .cmd files are not executable
    // without a terminal. On Unix/macOS, we resolve the full path first, then use
    // array args (safer, no escaping needed).
    // See: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
    let child;
    if (os.platform() === "win32") {
      const fullCommand = buildCommand(command, args);
      child = spawn(fullCommand, { ...options, shell: true });
    } else {
      const fullPath = resolveCommandPath(command);
      child = spawn(fullPath, args, options);
    }

    // When stdio is piped, we need to collect the output
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      // Code is null if it terminated by a signal. This should never
      // happen in our code. If this happens, return 1 error code.

      code = code ?? 1;

      resolve({
        status: code,
        stdout: stdout,
        stderr: stderr,
      });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}
