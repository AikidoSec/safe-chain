#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";
import { PIP_PACKAGE_MANAGER, PIP_COMMAND } from "../src/packagemanager/pip/pipSettings.js";

// Set eco system
setEcoSystem(ECOSYSTEM_PY);

initializePackageManager(PIP_PACKAGE_MANAGER, { tool: PIP_COMMAND, args: process.argv.slice(2) });

(async () => {
  // Pass through only user-supplied pip args
  var exitCode = await main(process.argv.slice(2));
  process.exit(exitCode);
})();
