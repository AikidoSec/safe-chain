#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";

const packageManagerName = "npx";
initializePackageManager(packageManagerName, process.versions.node);
await main(process.argv.slice(2));
