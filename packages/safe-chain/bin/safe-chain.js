#!/usr/bin/env node

import chalk from "chalk";
import { ui } from "../src/environment/userInteraction.js";
import { setup } from "../src/shell-integration/setup.js";
import { teardown } from "../src/shell-integration/teardown.js";
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
  PIP_INVOCATIONS,
  PIP_PACKAGE_MANAGER,
  setCurrentPipInvocation,
} from "../src/packagemanager/pip/pipSettings.js";

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

const tool = knownAikidoTools.find((tool) => tool.tool === command);

if (tool && tool.internalPackageManagerName === PIP_PACKAGE_MANAGER) {
  (async function () {
    await executePip(tool);
  })();
} else if (tool) {
  const args = process.argv.slice(3);

  setEcoSystem(tool.ecoSystem);
  initializePackageManager(tool.internalPackageManagerName);

  (async () => {
    var exitCode = await main(args);
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

  return "0.0.0";
}

/**
 * @param {import("../src/shell-integration/helpers.js").AikidoTool} tool
 */
async function executePip(tool) {
  // Scanners for pip / pip3 / python / python3 use a slightly different approach:
  //  - They all use the same PIP_PACKAGE_MANAGER internally, but need some setup to be able to do so
  //     - It needs to set which tool to run (pip / pip3 / python / python3)
  //     - For python and python3, the -m pip/pip3 args are removed and later added again by the package manager
  //  - Python / python3 skips safe-chain if not being run with -m pip or -m pip3

  let args = process.argv.slice(3);
  setEcoSystem(tool.ecoSystem);
  initializePackageManager(PIP_PACKAGE_MANAGER);

  let shouldSkip = false;
  if (tool.tool === "pip") {
    setCurrentPipInvocation(PIP_INVOCATIONS.PIP);
  } else if (tool.tool === "pip3") {
    setCurrentPipInvocation(PIP_INVOCATIONS.PIP3);
  } else if (tool.tool === "python") {
    if (args[0] === "-m" && (args[1] === "pip" || args[1] === "pip3")) {
      setCurrentPipInvocation(
        args[1] === "pip3" ? PIP_INVOCATIONS.PY_PIP3 : PIP_INVOCATIONS.PY_PIP
      );
      args = args.slice(2);
    } else {
      shouldSkip = true;
    }
  } else if (tool.tool === "python3") {
    if (args[0] === "-m" && (args[1] === "pip" || args[1] === "pip3")) {
      setCurrentPipInvocation(
        args[1] === "pip3" ? PIP_INVOCATIONS.PY3_PIP3 : PIP_INVOCATIONS.PY3_PIP
      );
      args = args.slice(2);
    } else {
      shouldSkip = true;
    }
  }

  if (shouldSkip) {
    const { spawn } = await import("child_process");
    spawn(tool.tool, args, { stdio: "inherit" });
  } else {
    var exitCode = await main(args);
    process.exit(exitCode);
  }
}
