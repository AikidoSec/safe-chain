import { parseDryRunOutput } from "../parsing/parseNpmInstallDryRunOutput.js";
import { dryRunNpmCommandAndOutput } from "../runNpmCommand.js";
import { hasDryRunArg } from "../utils/npmCommands.js";

export function dryRunScanner(scannerOptions) {
  return {
    scan: (args) => scanDependencies(scannerOptions, args),
    shouldScan: (args) => shouldScanDependencies(scannerOptions, args),
  };
}

function scanDependencies(scannerOptions, args) {
  let dryRunArgs = args;

  if (scannerOptions?.dryRunCommand) {
    // Replace the first argument with the dryRunCommand (eg: "install" instead of "install-test")
    dryRunArgs = [scannerOptions.dryRunCommand, ...args.slice(1)];
  }

  return checkChangesWithDryRun(dryRunArgs);
}

function shouldScanDependencies(scannerOptions, args) {
  if (hasDryRunArg(args)) {
    return false;
  }

  if (scannerOptions?.skipScanWhen && scannerOptions.skipScanWhen(args)) {
    return false;
  }

  return true;
}

async function checkChangesWithDryRun(args) {
  const dryRunOutput = await dryRunNpmCommandAndOutput(args);

  // Dry-run can return a non-zero status code in some cases
  //  e.g., when running "npm audit fix --dry-run", it returns exit code 1
  //  when there are vulnerabilities that can be fixed.
  if (dryRunOutput.status !== 0 && !canCommandReturnNonZeroOnSuccess(args)) {
    throw new Error(
      `Dry-run command failed with exit code ${dryRunOutput.status} and output:\n${dryRunOutput.output}`
    );
  }

  if (dryRunOutput.status !== 0 && !dryRunOutput.output) {
    throw new Error(
      `Dry-run command failed with exit code ${dryRunOutput.status} and produced no output.`
    );
  }

  const parsedOutput = parseDryRunOutput(dryRunOutput.output);

  // reverse the array to have the top-level packages first
  return parsedOutput.reverse();
}

function canCommandReturnNonZeroOnSuccess(args) {
  if (args.length < 2) {
    return false;
  }

  // `npm audit fix --dry-run` can return exit code 1 when it succesfully ran and
  // there were vulnerabilities that could be fixed
  return args[0] === "audit" && args[1] === "fix";
}
