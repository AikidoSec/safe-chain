#!/usr/bin/env node

import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setCurrentPipInvocation, PIP_INVOCATIONS, PIP_PACKAGE_MANAGER } from "../src/packagemanager/pip/pipSettings.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";
import { main } from "../src/main.js";

// Set eco system
setEcoSystem(ECOSYSTEM_PY);

// Strip nodejs and wrapper script from args
let argv = process.argv.slice(2);

if (argv[0] === '-m' && (argv[1] === 'pip' || argv[1] === 'pip3')) {
	setEcoSystem(ECOSYSTEM_PY);
	setCurrentPipInvocation(argv[1] === 'pip3' ? PIP_INVOCATIONS.PY3_PIP3 : PIP_INVOCATIONS.PY3_PIP);
	initializePackageManager(PIP_PACKAGE_MANAGER);

  // Strip off the '-m pip' or '-m pip3' from the args
	argv = argv.slice(2);

  var exitCode = await main(argv);
	process.exit(exitCode);
} else {
	// Forward to real python3 binary for non-pip flows
	const { spawn } = await import('child_process');
	spawn('python3', argv, { stdio: 'inherit' });
}
