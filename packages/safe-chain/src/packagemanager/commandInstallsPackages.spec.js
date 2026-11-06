import { describe, it } from "node:test";
import assert from "node:assert";
import { createNpmPackageManager } from "./npm/createPackageManager.js";
import { createPnpmPackageManager } from "./pnpm/createPackageManager.js";
import { createYarnPackageManager } from "./yarn/createPackageManager.js";
import { createBunPackageManager } from "./bun/createBunPackageManager.js";

describe("commandInstallsPackages", () => {
  const cases = {
    npm: {
      packageManager: createNpmPackageManager(),
      installs: [["install"], ["i", "lodash"], ["ci"], ["clean-install"], ["update"], ["dedupe"]],
      doesNotInstall: [[], ["view", "lodash"], ["config", "get", "registry"], ["ls"], ["run", "build"], ["exec", "foo"]],
    },
    pnpm: {
      packageManager: createPnpmPackageManager(),
      installs: [[], ["install"], ["i"], ["--filter", "pkg", "add", "lodash"], ["up"]],
      doesNotInstall: [["view", "lodash"], ["run", "build"], ["dlx", "foo"], ["publish"]],
    },
    yarn: {
      packageManager: createYarnPackageManager(),
      installs: [[], ["install"], ["--immutable"], ["add", "lodash"], ["up"]],
      doesNotInstall: [["info", "lodash"], ["run", "build"], ["dlx", "foo"]],
    },
    bun: {
      packageManager: createBunPackageManager(),
      installs: [["install"], ["i"], ["add", "lodash"], ["update"]],
      doesNotInstall: [[], ["run", "build"], ["x", "foo"], ["pm", "ls"]],
    },
  };

  for (const [name, { packageManager, installs, doesNotInstall }] of Object.entries(cases)) {
    for (const args of installs) {
      it(`is true for: ${name} ${args.join(" ")}`, () => {
        assert.equal(packageManager.commandInstallsPackages?.(args), true);
      });
    }
    for (const args of doesNotInstall) {
      it(`is false for: ${name} ${args.join(" ")}`, () => {
        assert.equal(packageManager.commandInstallsPackages?.(args), false);
      });
    }
  }
});
