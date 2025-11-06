#!/usr/bin/env node


import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";
import { main } from "../src/main.js";

const argv = process.argv.slice(2);

const supportedArgs = ["pip", "pip3"];

if (argv[0] === "-m" && argv[1] && supportedArgs.includes(argv[1])) {
	setEcoSystem(ECOSYSTEM_PY);

	initializePackageManager(argv[1]);
	var exitCode = await main(argv.slice(2));
  process.exit(exitCode);
} else {
	// Fallback: run the real python
	const { spawn } = await import("child_process");
	spawn("python", argv, { stdio: "inherit" });
}
