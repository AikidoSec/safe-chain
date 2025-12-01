#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";

setEcoSystem(ECOSYSTEM_PY);
const packageManagerName = "poetry";
initializePackageManager(packageManagerName);
var exitCode = await main(process.argv.slice(2));

process.exit(exitCode);
