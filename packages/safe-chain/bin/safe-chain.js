#!/usr/bin/env node

import chalk from "chalk";
import { createRequire } from "module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ui } from "../src/environment/userInteraction.js";
import { setup } from "../src/shell-integration/setup.js";
import { teardown } from "../src/shell-integration/teardown.js";
import { setupCi } from "../src/shell-integration/setup-ci.js";
import { runCommand } from "../src/agent/runCommand.js";
import { generateCertCommand } from "../src/agent/generateCert.js";

if (process.argv.length < 3) {
  ui.writeError("No command provided. Please provide a command to execute.");
  ui.emptyLine();
  writeHelp();
  process.exit(1);
}

const command = process.argv[2];

if (command === "help" || command === "--help" || command === "-h") {
  writeHelp();
  process.exit(0);
}

if (command === "setup") {
  setup();
} else if (command === "teardown") {
  teardown();
} else if (command === "setup-ci") {
  setupCi();
} else if (command === "run") {
  // Pass remaining arguments to runCommand
  const runArgs = process.argv.slice(3);
  runCommand(runArgs);
} else if (command === "_generate-cert") {
  // Internal command for installer
  // Pass remaining arguments to generateCertCommand
  const certArgs = process.argv.slice(3);
  generateCertCommand(certArgs);
} else if (command === "--version" || command === "-v" || command === "-v") {
  ui.writeInformation(`Current safe-chain version: ${getVersion()}`);
} else {
  ui.writeError(`Unknown command: ${command}.`);
  ui.emptyLine();

  writeHelp();

  process.exit(1);
}

function writeHelp() {
  ui.writeInformation(
    chalk.bold("Usage: ") + chalk.cyan("safe-chain <command>")
  );
  ui.emptyLine();
  ui.writeInformation(
    `Available commands: ${chalk.cyan("setup")}, ${chalk.cyan(
      "teardown"
    )}, ${chalk.cyan("setup-ci")}, ${chalk.cyan("run")}, ${chalk.cyan("help")}, ${chalk.cyan("--version")}`
  );
  ui.emptyLine();
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain setup"
    )}: This will setup your shell to wrap safe-chain around npm, npx, yarn, pnpm, pnpx, bun, bunx, pip and pip3.`
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain teardown"
    )}: This will remove safe-chain aliases from your shell configuration.`
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain setup-ci"
    )}: This will setup safe-chain for CI environments by creating shims and modifying the PATH.`
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain run"
    )}: Run the proxy as a standalone service. Sets system-wide proxy environment variables. Options: --verbose`
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain --version"
    )} (or ${chalk.cyan("-v")}): Display the current version of safe-chain.`
  );
  ui.emptyLine();
}

function getVersion() {
  try {
    // Try to load package.json from the expected location
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, '../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    // Fallback for bundled version
    return '1.0.0';
  }
}
