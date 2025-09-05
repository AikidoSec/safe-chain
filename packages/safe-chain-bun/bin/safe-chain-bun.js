#!/usr/bin/env node

// Placeholder for setup function - will be implemented in next step
function setup(configFile) {
  console.log("Setup functionality coming soon...");
  console.log("Target config file:", configFile || "~/.bunfig.toml");
}

if (process.argv.length < 3) {
  console.error("No command provided. Please provide a command to execute.");
  console.log();
  writeHelp();
  process.exit(1);
}

const command = process.argv[2];

if (command === "help" || command === "--help" || command === "-h") {
  writeHelp();
  process.exit(0);
}

if (command === "setup") {
  const configFile = process.argv[3];
  setup(configFile);
} else {
  console.error(`Unknown command: ${command}.`);
  console.log();
  writeHelp();
  process.exit(1);
}

function writeHelp() {
  console.log("Usage: safe-chain-bun <command>");
  console.log();
  console.log("Available commands: setup, help");
  console.log();
  console.log("- safe-chain-bun setup: Register Safe-Chain-Bun as a security scanner in ~/.bunfig.toml");
  console.log("- safe-chain-bun setup <file>: Register Safe-Chain-Bun as a security scanner in specified bunfig.toml file");
  console.log();
}