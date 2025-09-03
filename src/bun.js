// Bun Security Scanner POC for Safe-Chain
// This is the entry point for Bun's native security scanner integration

const BLOCKED_PACKAGES = [
  "evil-package",
  "malicious-lib",
  "test-malware",
  "safe-chain-test",
];

export const scanner = {
  version: "1", // Required by Bun security scanner interface

  async scan({ packages }) {
    const advisories = [];

    try {
      for (const pkg of packages) {
        if (BLOCKED_PACKAGES.includes(pkg.name)) {
          advisories.push({
            level: "fatal",
            package: pkg.name,
            url: null,
            description: `Package ${pkg.name} is flagged as malicious by Aikido Intel. Installation blocked.`,
          });
        }
      }
    } catch (error) {
      console.warn(`Safe-Chain security scan failed: ${error.message}`);
      // Graceful degradation - let installation proceed but log warning
    }

    return advisories;
  },
};
