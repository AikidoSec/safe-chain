#!/usr/bin/env node

import chalk from "chalk";
import { ui } from "../src/environment/userInteraction.js";
import { setup } from "../src/shell-integration/setup.js";
import {
  teardown,
  teardownDirectories,
} from "../src/shell-integration/teardown.js";
import { setupCi } from "../src/shell-integration/setup-ci.js";
import { initializeCliArguments } from "../src/config/cliArguments.js";
import { setEcoSystem } from "../src/config/settings.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { main } from "../src/main.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { knownAikidoTools } from "../src/shell-integration/helpers.js";
import {
  installUltimate,
  uninstallUltimate,
} from "../src/installation/installUltimate.js";
import {
  printUltimateLogs,
  troubleshootingExport,
} from "../src/ultimate/ultimateTroubleshooting.js";

/** @type {string} */
// This checks the current file's dirname in a way that's compatible with:
//  - Modulejs (import.meta.url)
//  - ES modules (__dirname)
// This is needed because safe-chain's npm package is built using ES modules,
// but building the binaries requires commonjs.
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

const tool = knownAikidoTools.find((tool) => tool.tool === command);

if (tool) {
  const args = process.argv.slice(3);

  setEcoSystem(tool.ecoSystem);

  // Provide tool context to PM (pip uses this; others ignore)
  const toolContext = { tool: tool.tool, args };
  initializePackageManager(tool.internalPackageManagerName, toolContext);

  (async () => {
    var exitCode = await main(args);
    process.exit(exitCode);
  })();
} else if (command === "help" || command === "--help" || command === "-h") {
  writeHelp();
  process.exit(0);
} else if (command === "setup") {
  setup();
} else if (command === "ultimate") {
  const cliArgs = initializeCliArguments(process.argv.slice(2));
  const subCommand = cliArgs[1];
  if (subCommand === "uninstall") {
    guardCliArgsMaxLenght(2, cliArgs, "safe-chain ultimate uninstall");
    (async () => {
      await uninstallUltimate();
    })();
  } else if (subCommand === "troubleshooting-logs") {
    guardCliArgsMaxLenght(
      2,
      cliArgs,
      "safe-chain ultimate troubleshooting-logs",
    );
    (async () => {
      await printUltimateLogs();
    })();
  } else if (subCommand === "troubleshooting-export") {
    guardCliArgsMaxLenght(
      2,
      cliArgs,
      "safe-chain ultimate troubleshooting-export",
    );
    (async () => {
      await troubleshootingExport();
    })();
  } else {
    guardCliArgsMaxLenght(1, cliArgs, "safe-chain ultimate");
    // Install command = when no subcommand is provided (safe-chain ultimate)
    (async () => {
      await installUltimate();
    })();
  }
} else if (command === "teardown") {
  teardown();
  teardownDirectories();
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

/**
 * @param {Number} maxLength
 * @param {String[]} args
 * @param {String} command
 */
function guardCliArgsMaxLenght(maxLength, args, command) {
  if (args.length > maxLength) {
    ui.writeError(`Unexpected number of arguments for command ${command}.`);
    ui.emptyLine();

    writeHelp();

    process.exit(1);
  }
}

function writeHelp() {
  ui.writeInformation(
    chalk.bold("Usage: ") + chalk.cyan("safe-chain <command>"),
  );
  ui.emptyLine();
  ui.writeInformation(
    `Available commands: ${chalk.cyan("setup")}, ${chalk.cyan(
      "teardown",
    )}, ${chalk.cyan("setup-ci")}, ${chalk.cyan("ultimate")}, ${chalk.cyan("help")}, ${chalk.cyan(
      "--version",
    )}`,
  );
  ui.emptyLine();
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain setup",
    )}: This will setup your shell to wrap safe-chain around npm, npx, yarn, pnpm, pnpx, bun, bunx, pip and pip3.`,
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain teardown",
    )}: This will remove safe-chain aliases from your shell configuration.`,
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain setup-ci",
    )}: This will setup safe-chain for CI environments by creating shims and modifying the PATH.`,
  );
  ui.writeInformation(
    `- ${chalk.cyan("safe-chain --version")} (or ${chalk.cyan(
      "-v",
    )}): Display the current version of safe-chain.`,
  );
  ui.emptyLine();
  ui.writeInformation(chalk.bold("Ultimate commands:"));
  ui.emptyLine();
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain ultimate",
    )}: Install the ultimate version of safe-chain, enabling protection for more eco-systems.`,
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain ultimate troubleshooting-logs",
    )}: Prints standard and error logs for safe-chain ultimate and it's proxy.`,
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain ultimate troubleshooting-export",
    )}: Creates a zip archive of useful data for troubleshooting safe-chain ultimate, that can be shared with our support team.`,
  );
  ui.writeInformation(
    `- ${chalk.cyan(
      "safe-chain ultimate uninstall",
    )}: Uninstall the ultimate version of safe-chain.`,
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

  return "0.0.0";
}
