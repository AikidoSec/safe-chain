import { spawn, execSync } from "child_process";
import os from "os";

function sanitizeShellArgument(arg) {
  // If argument contains shell metacharacters, wrap in double quotes
  // and escape characters that are special even inside double quotes
  if (hasShellMetaChars(arg)) {
    // Inside double quotes, we need to escape: " $ ` \
    return '"' + escapeDoubleQuoteContent(arg) + '"';
  }
  return arg;
}

function hasShellMetaChars(arg) {
  // Shell metacharacters that need escaping
  // These characters have special meaning in shells and need to be quoted
  // Whenever one of these characters is present, we should quote the argument
  // Characters: space, ", &, ', |, ;, <, >, (, ), $, `, \, !, *, ?, [, ], {, }, ~, #
  const shellMetaChars = /[ "&'|;<>()$`\\!*?[\]{}~#]/;
  return shellMetaChars.test(arg);
}

function escapeDoubleQuoteContent(arg) {
  // Escape special characters for shell safety
  // This escapes ", $, `, and \ by prefixing them with a backslash
  return arg.replace(/(["`$\\])/g, "\\$1");
}

function buildCommand(command, args) {
  if (args.length === 0) {
    return command;
  }

  const escapedArgs = args.map(sanitizeShellArgument);

  return `${command} ${escapedArgs.join(" ")}`;
}

function resolveCommandPath(command) {
  // command will be "npm", "yarn", etc.
  // Use 'command -v' to find the full path
  const fullPath = execSync(`command -v ${command}`, {
    encoding: "utf8",
    shell: true,
  }).trim();

  if (!fullPath) {
    throw new Error(`Command not found: ${command}`);
  }

  return fullPath;
}

export async function safeSpawn(command, args, options = {}) {
  // command should always be alphanumeric or _ or - to avoid injection
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
