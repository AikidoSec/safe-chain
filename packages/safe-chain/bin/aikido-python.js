#!/usr/bin/env node

import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setCurrentPipInvocation, PIP_INVOCATIONS, PIP_PACKAGE_MANAGER } from "../src/packagemanager/pip/pipSettings.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";
import { main } from "../src/main.js";

// Set eco system
setEcoSystem(ECOSYSTEM_PY);


// Strip '-m pip' or '-m pip3' from args if present
let argv = process.argv.slice(2);
if (argv[0] === '-m' && argv[1] === 'pip') {
	setEcoSystem(ECOSYSTEM_PY);
	setCurrentPipInvocation(PIP_INVOCATIONS.PY_PIP);
	initializePackageManager(PIP_PACKAGE_MANAGER);
	argv = argv.slice(2);
	var exitCode = await main(argv);
	process.exit(exitCode);
} else {
	// Forward to real python binary for non-pip flows
	const { spawn } = await import('child_process');
	spawn('python', argv, { stdio: 'inherit' });
}
