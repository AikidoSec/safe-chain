#!/usr/bin/env node

import chalk from "chalk";
import { ui } from "../src/environment/userInteraction.js";
import { setup } from "../src/shell-integration/setup.js";
import { teardown } from "../src/shell-integration/teardown.js";
import { setupCi } from "../src/shell-integration/setup-ci.js";

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
    )}, ${chalk.cyan("help")}`
  );
  ui.emptyLine();
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain setup"
    )}: This will setup your shell to wrap safe-chain around npm, npx, yarn, pnpm and pnpx.`
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
  ui.emptyLine();
}
