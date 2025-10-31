#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";

// Explicit pip3 entrypoint
const packageManagerName = "pip3";

// Copy argv as-is
const argv = process.argv.slice(2);

// Set ecosystem to Python
setEcoSystem(ECOSYSTEM_PY);

initializePackageManager(packageManagerName);
const exitCode = await main(argv);

process.exit(exitCode);
