#!/usr/bin/env node

import { main } from "../src/main.js";
import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";
import { setCurrentPipInvocation, PIP_INVOCATIONS, PIP_PACKAGE_MANAGER } from "../src/packagemanager/pip/pipSettings.js";

// Set eco system
setEcoSystem(ECOSYSTEM_PY);

// Set current invocation
setCurrentPipInvocation(PIP_INVOCATIONS.PIP);

initializePackageManager(PIP_PACKAGE_MANAGER);

// Pass through only user-supplied pip args
var exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
