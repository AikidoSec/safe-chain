import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe.skip(
  "E2E: minimum package age direct request fallback",
  () => {
    let container;

    before(async () => {
      DockerTestContainer.buildImage();
    });

    beforeEach(async () => {
      container = new DockerTestContainer();
      await container.start();

      const installationShell = await container.openShell("zsh");
      await installationShell.runCommand("safe-chain setup-ci");
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
    });

    afterEach(async () => {
      if (container) {
        await container.stop();
        container = null;
      }
    });

    it("blocks npm ci when a lockfile resolves to a recently released package", async () => {
      const shell = await container.openShell("zsh");

      await shell.runCommand(
        "npm init -y && npm pkg set dependencies.axios=1.8.4"
      );
      await shell.runCommand("npm install --package-lock-only");
      await shell.runCommand("rm -rf node_modules");
      await seedNewPackagesListCache(shell, [
        {
          package_name: "axios",
          version: "1.8.4",
          released_on: unixHoursAgo(1),
          scraped_on: unixHoursAgo(1),
        },
      ]);

      const result = await shell.runCommand(
        "npm ci --safe-chain-minimum-package-age-hours=168 --safe-chain-logging=verbose"
      );

      assert.ok(
        result.output.includes(
          "blocked 1 direct package download request(s) due to minimum package age"
        ),
        `Output did not include expected text. Output was:\n${result.output}`
      );
      assert.ok(
        result.output.includes("- axios@1.8.4"),
        `Output did not include expected text. Output was:\n${result.output}`
      );
      assert.ok(
        result.output.includes(
          "Exiting without installing packages blocked by the direct download minimum package age check."
        ),
        `Output did not include expected text. Output was:\n${result.output}`
      );
    });

    it("blocks yarn frozen-lockfile installs when the cached recent releases list marks the tarball as too young", async () => {
      const shell = await container.openShell("zsh");

      await shell.runCommand(
        "npm init -y && npm pkg set dependencies.axios=1.8.4"
      );
      await shell.runCommand("yarn install");
      await shell.runCommand("rm -rf node_modules");
      await seedNewPackagesListCache(shell, [
        {
          package_name: "axios",
          version: "1.8.4",
          released_on: unixHoursAgo(1),
          scraped_on: unixHoursAgo(1),
        },
      ]);

      const result = await shell.runCommand(
        "yarn install --frozen-lockfile --safe-chain-minimum-package-age-hours=168 --safe-chain-logging=verbose"
      );

      assert.ok(
        result.output.includes(
          "blocked 1 direct package download request(s) due to minimum package age"
        ),
        `Output did not include expected text. Output was:\n${result.output}`
      );
      assert.ok(
        result.output.includes("- axios@1.8.4"),
        `Output did not include expected text. Output was:\n${result.output}`
      );
    });

    it("allows the same lockfile-driven install when minimum age checks are skipped", async () => {
      const shell = await container.openShell("zsh");

      await shell.runCommand(
        "npm init -y && npm pkg set dependencies.axios=1.8.4"
      );
      await shell.runCommand("npm install --package-lock-only");
      await shell.runCommand("rm -rf node_modules");
      await seedNewPackagesListCache(shell, [
        {
          package_name: "axios",
          version: "1.8.4",
          released_on: unixHoursAgo(1),
          scraped_on: unixHoursAgo(1),
        },
      ]);

      const result = await shell.runCommand(
        "npm ci --safe-chain-minimum-package-age-hours=168 --safe-chain-skip-minimum-package-age --safe-chain-logging=verbose"
      );

      assert.ok(
        result.output.includes("no malware found."),
        `Output did not include expected text. Output was:\n${result.output}`
      );
      assert.ok(
        !result.output.includes(
          "direct package download request(s) due to minimum package age"
        ),
        `Output unexpectedly contained a direct request block. Output was:\n${result.output}`
      );
    });
  }
);

/**
 * @param {{ runCommand: (command: string) => Promise<{output: string}> }} shell
 * @param {Array<{package_name: string, version: string, released_on: number, scraped_on: number}>} entries
 */
async function seedNewPackagesListCache(shell, entries) {
  const payload = JSON.stringify(entries).replace(/"/g, '\\"');

  await shell.runCommand("mkdir -p ~/.safe-chain");
  await shell.runCommand(
    `printf "%s" "${payload}" > ~/.safe-chain/newPackagesList_js.json`
  );
  await shell.runCommand(
    'printf "%s" "test-etag" > ~/.safe-chain/newPackagesList_version_js.txt'
  );
}

/**
 * @param {number} hours
 * @returns {number}
 */
function unixHoursAgo(hours) {
  return Math.floor((Date.now() - hours * 3600 * 1000) / 1000);
}
