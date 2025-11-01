#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";

const packageManagerName = "pnpm";
initializePackageManager(packageManagerName);
var exitCode = await main(process.argv.slice(2));

// @ts-expect-error scanCommand can return an empty array in main
process.exit(exitCode);
