#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";
import { UV_PACKAGE_MANAGER } from "../src/packagemanager/uv/uvSettings.js";

// Set eco system
setEcoSystem(ECOSYSTEM_PY);

initializePackageManager(UV_PACKAGE_MANAGER);

// Pass through only user-supplied uv args
var exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
