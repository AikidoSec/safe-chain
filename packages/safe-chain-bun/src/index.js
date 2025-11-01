// oxlint-disable no-console
import { auditChanges } from "@aikidosec/safe-chain/scanning";

// Bun Security Scanner for Safe-Chain
// This is the entry point for Bun's native security scanner integration

export const scanner = {
  version: "1", // Our scanner is using version 1 of the bun security scanner API.

  async scan({ packages }) {
    const advisories = [];

    try {
      const changes = packages.map((pkg) => ({
        name: pkg.name,
        version: pkg.version,
        type: "add",
      }));

      const audit = await auditChanges(changes);

      if (!audit.isAllowed) {
        for (const change of audit.disallowedChanges) {
          advisories.push({
            level: "fatal", // Fatal will block the installation process, this is what we want for packages that contain malware.
            package: change.name,
            url: null,
            description: `Package ${change.name}@${change.version} contains known security threats (${change.reason}). Installation blocked by Safe-Chain.`,
          });
        }
      }
    } catch (/** @type any */ error) {
      console.warn(`Safe-Chain security scan failed: ${error.message}`);
    }

    return advisories;
  },
};
