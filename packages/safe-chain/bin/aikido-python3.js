#!/usr/bin/env node


import { initializePackageManager } from "../src/packagemanager/currentPackageManager.js";
import { setEcoSystem, ECOSYSTEM_PY } from "../src/config/settings.js";
import { main } from "../src/main.js";

const argv = process.argv.slice(2);

const supportedArgs = ["pip", "pip3"];

if (argv[0] === "-m" && argv[1] && supportedArgs.includes(argv[1])) {
	setEcoSystem(ECOSYSTEM_PY);
  // python3 -m pip or python3 -m pip3: always use pip3 package manager
	initializePackageManager("pip3");
  var exitCode = await main(argv.slice(2));
  process.exit(exitCode);
} else {
	// Fallback: run the real python3
	const { spawn } = await import("child_process");
	spawn("python3", argv, { stdio: "inherit" });
}
