#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";

const packageManagerName = "yarn";
initializePackageManager(packageManagerName);
var exitCode = await main(process.argv.slice(2));

process.exit(exitCode);
