#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";

// Defaults
let packageManagerName = "pip";
// Pass through user args as-is
const argv = process.argv.slice(2);

// Set eco system
// This can be used in other parts of the code to determine which eco system we are working with
setEcoSystem(ECOSYSTEM_PY);

initializePackageManager(packageManagerName);
var exitCode = await main(argv);

process.exit(exitCode);
