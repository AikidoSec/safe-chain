#!/usr/bin/env node

import { execSync } from "child_process";
import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";

const packageManagerName = "npm";
initializePackageManager(packageManagerName, getNpmVersion());
var exitCode = await main(process.argv.slice(2));

process.exit(exitCode);

function getNpmVersion() {
  try {
    return execSync("npm --version").toString().trim();
  } catch {
    // Default to 0.0.0 if npm is not found
    // That way we don't use any unsupported features
    return "0.0.0";
  }
}
