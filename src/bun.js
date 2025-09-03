// Bun Security Scanner for Safe-Chain
// This is the entry point for Bun's native security scanner integration

import { auditChanges } from "./scanning/audit/index.js";

export const scanner = {
  version: "1", // Required by Bun security scanner interface

  async scan({ packages }) {
    const advisories = [];

    try {
      // Convert Bun package format to safe-chain's internal format
      const changes = packages.map(pkg => ({
        name: pkg.name,
        version: pkg.version,
        type: "add", // Bun packages being scanned are always being added
      }));

      // Reuse existing safe-chain scanning logic
      const audit = await auditChanges(changes);

      // Convert safe-chain audit results to Bun advisory format
      if (!audit.isAllowed) {
        for (const change of audit.disallowedChanges) {
          advisories.push({
            level: "fatal", // Block malicious packages
            package: change.name,
            url: null,
            description: `Package ${change.name}@${change.version} contains known security threats (${change.reason}). Installation blocked by Safe-Chain.`,
          });
        }
      }
    } catch (error) {
      // Graceful degradation - log error but don't block installation
      console.warn(`Safe-Chain security scan failed: ${error.message}`);
    }

    return advisories;
  },
};
