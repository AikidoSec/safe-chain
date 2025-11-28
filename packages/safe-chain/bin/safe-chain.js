#!/usr/bin/env node

import chalk from "chalk";
import { ui } from "../src/environment/userInteraction.js";
import { setup } from "../src/shell-integration/setup.js";
import { teardown } from "../src/shell-integration/teardown.js";
import { setupCi } from "../src/shell-integration/setup-ci.js";
import { initializeCliArguments } from "../src/config/cliArguments.js";
import { ECOSYSTEM_JS, setEcoSystem } from "../src/config/settings.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { main } from "../src/main.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

/** @type {string} */
let dirname;

if (import.meta.url) {
  const filename = fileURLToPath(import.meta.url);
  dirname = path.dirname(filename);
} else {
  dirname = __dirname;
}

if (process.argv.length < 3) {
  ui.writeError("No command provided. Please provide a command to execute.");
  ui.emptyLine();
  writeHelp();
  process.exit(1);
}

initializeCliArguments(process.argv);

const command = process.argv[2];

const pkgManagerCommands = [
  "npm",
  "npx",
  "yarn",
  "bun",
  "bunx",
  "pnpm",
  "pnpx",
];

if (pkgManagerCommands.includes(command)) {
  setEcoSystem(ECOSYSTEM_JS);
  initializePackageManager(command);
  (async () => {
    var exitCode = await main(process.argv.slice(3));
    process.exit(exitCode);
  })();
} else if (command === "help" || command === "--help" || command === "-h") {
  writeHelp();
  process.exit(0);
} else if (command === "setup") {
  setup();
} else if (command === "teardown") {
  teardown();
} else if (command === "setup-ci") {
  setupCi();
} else if (command === "--version" || command === "-v" || command === "-v") {
  (async () => {
    ui.writeInformation(`Current safe-chain version: ${await getVersion()}`);
  })();
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

async function getVersion() {
  const packageJsonPath = path.join(dirname, "..", "package.json");

  const data = await fs.promises.readFile(packageJsonPath);
  const json = JSON.parse(data.toString("utf8"));

  if (json && json.version) {
    return json.version;
  }

  return "1.0.0";
}
