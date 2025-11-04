import chalk from "chalk";
import { ui } from "../environment/userInteraction.js";
import { knownAikidoTools, getPackageManagerList } from "./helpers.js";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Loops over the detected shells and calls the setup function for each.
 */
export async function setupCi() {
  ui.writeInformation(
    chalk.bold("Setting up shell aliases.") +
      ` This will wrap safe-chain around ${getPackageManagerList()}.`
  );
  ui.emptyLine();

  const shimsDir = path.join(os.homedir(), ".safe-chain", "shims");
  // Create the shims directory if it doesn't exist
  if (!fs.existsSync(shimsDir)) {
    fs.mkdirSync(shimsDir, { recursive: true });
  }

  createShims(shimsDir);
  ui.writeInformation(`Created shims in ${shimsDir}`);
  modifyPathForCi(shimsDir);
  ui.writeInformation(`Added shims directory to PATH for CI environments.`);
}

/**
 * @param {string} shimsDir
 *
 * @returns {void}
 */
function createUnixShims(shimsDir) {
  // Read the template file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const templatePath = path.resolve(
    __dirname,
    "path-wrappers",
    "templates",
    "unix-wrapper.template.sh"
  );

  if (!fs.existsSync(templatePath)) {
    ui.writeError(`Template file not found: ${templatePath}`);
    return;
  }

  const template = fs.readFileSync(templatePath, "utf-8");

  // Create a shim for each tool except pip (CI support not yet implemented)
  let created = 0;
  for (const toolInfo of knownAikidoTools) {
    if (toolInfo.tool === "pip") {
      continue; // Skip pip shims in CI for now
    }

    const shimContent = template
      .replaceAll("{{PACKAGE_MANAGER}}", toolInfo.tool)
      .replaceAll("{{AIKIDO_COMMAND}}", toolInfo.aikidoCommand);

    const shimPath = path.join(shimsDir, toolInfo.tool);
    fs.writeFileSync(shimPath, shimContent, "utf-8");

    // Make the shim executable on Unix systems
    fs.chmodSync(shimPath, 0o755);
    created++;
  }

  ui.writeInformation(
    `Created ${created} Unix shim(s) in ${shimsDir}`
  );
}

/**
 * @param {string} shimsDir
 *
 * @returns {void}
 */
function createWindowsShims(shimsDir) {
  // Read the template file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const templatePath = path.resolve(
    __dirname,
    "path-wrappers",
    "templates",
    "windows-wrapper.template.cmd"
  );

  if (!fs.existsSync(templatePath)) {
    ui.writeError(`Windows template file not found: ${templatePath}`);
    return;
  }

  const template = fs.readFileSync(templatePath, "utf-8");

  // Create a shim for each tool except pip (CI support not yet implemented)
  let created = 0;
  for (const toolInfo of knownAikidoTools) {
    if (toolInfo.tool === "pip") {
      continue; // Skip pip shims in CI for now
    }

    const shimContent = template
      .replaceAll("{{PACKAGE_MANAGER}}", toolInfo.tool)
      .replaceAll("{{AIKIDO_COMMAND}}", toolInfo.aikidoCommand);

    const shimPath = path.join(shimsDir, `${toolInfo.tool}.cmd`);
    fs.writeFileSync(shimPath, shimContent, "utf-8");
    created++;
  }

  ui.writeInformation(
    `Created ${created} Windows shim(s) in ${shimsDir}`
  );
}

/**
 * @param {string} shimsDir
 *
 * @returns {void}
 */
function createShims(shimsDir) {
  if (os.platform() === "win32") {
    createWindowsShims(shimsDir);
  } else {
    createUnixShims(shimsDir);
  }
}

/**
 * @param {string} shimsDir
 *
 * @returns {void}
 */
function modifyPathForCi(shimsDir) {
  if (process.env.GITHUB_PATH) {
    // In GitHub Actions, append the shims directory to GITHUB_PATH
    fs.appendFileSync(process.env.GITHUB_PATH, shimsDir + os.EOL, "utf-8");
    ui.writeInformation(
      `Added shims directory to GITHUB_PATH for GitHub Actions.`
    );
  }

  if (process.env.TF_BUILD) {
    // In Azure Pipelines, prepending the path is done via a logging command:
    //  ##vso[task.prependpath]/path/to/add
    // Logging this to stdout will cause the Azure Pipelines agent to pick it up
    ui.writeInformation("##vso[task.prependpath]" + shimsDir);
  }
}
