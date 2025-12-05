#!/usr/bin/env node

import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { PIP_PACKAGE_MANAGER, PYTHON_COMMAND } from "../src/packagemanager/pip/pipSettings.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";
import { main } from "../src/main.js";

// Set eco system
setEcoSystem(ECOSYSTEM_PY);

// Strip nodejs and wrapper script from args
let argv = process.argv.slice(2);

initializePackageManager(PIP_PACKAGE_MANAGER, { tool: PYTHON_COMMAND, args: argv });

(async () => {
  var exitCode = await main(argv);
  process.exit(exitCode);
})();
