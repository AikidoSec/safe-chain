#!/usr/bin/env node

import chalk from "chalk";
import { createRequire } from "module";
import { ui } from "../src/environment/userInteraction.js";
import { setup } from "../src/shell-integration/setup.js";
import { teardown } from "../src/shell-integration/teardown.js";
import { setupCi } from "../src/shell-integration/setup-ci.js";
import { initializeCliArguments } from "../src/config/cliArguments.js";

if (process.argv.length < 3) {
  ui.writeError("No command provided. Please provide a command to execute.");
  ui.emptyLine();
  writeHelp();
  process.exit(1);
}

initializeCliArguments(process.argv);

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
    )}, ${chalk.cyan("setup-ci")}, ${chalk.cyan("help")}, ${chalk.cyan(
      "--version"
    )}`
  );
  ui.emptyLine();
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain setup"
    )}: This will setup your shell to wrap safe-chain around npm, npx, yarn, pnpm, pnpx, bun, bunx, pip and pip3.`
  );
  ui.writeInformation(
    `    ${chalk.yellow(
      "--include-python"
    )}: Experimental: include Python package managers (pip, pip3) in the setup.`
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
    `    ${chalk.yellow(
      "--include-python"
    )}: Experimental: include Python package managers (pip, pip3) in the setup.`
  );
  ui.writeInformation(
    `- ${chalk.cyan("safe-chain --version")} (or ${chalk.cyan(
      "-v"
    )}): Display the current version of safe-chain.`
  );
  ui.emptyLine();
}

function getVersion() {
  const require = createRequire(import.meta.url);
  const packageJson = require("../package.json");
  return packageJson.version;
}
