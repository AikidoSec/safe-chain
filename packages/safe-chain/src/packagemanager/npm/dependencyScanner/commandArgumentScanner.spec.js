import assert from "node:assert/strict";
import { describe, it, mock, beforeEach } from "node:test";

describe("npm/commandArgumentScanner - non-registry package specification security", async () => {
  // Mock resolvePackageVersion to control resolution behavior
  const mockResolvePackageVersion = mock.fn();
  
  mock.module("../../../api/npmApi.js", {
    namedExports: {
      resolvePackageVersion: mockResolvePackageVersion,
    },
  });

  // Mock parsePackagesFromInstallArgs to return controlled package specs
  const mockParsePackagesFromInstallArgs = mock.fn();
  
  mock.module("../parsing/parsePackagesFromInstallArgs.js", {
    namedExports: {
      parsePackagesFromInstallArgs: mockParsePackagesFromInstallArgs,
    },
  });

  // Mock hasDryRunArg
  mock.module("../utils/npmCommands.js", {
    namedExports: {
      hasDryRunArg: () => false,
    },
  });

  const { checkChangesFromArgs } = await import("./commandArgumentScanner.js");

  beforeEach(() => {
    mockResolvePackageVersion.mock.resetCalls();
    mockParsePackagesFromInstallArgs.mock.resetCalls();
  });

  describe("URL-based package specifications", () => {
    it("should reject HTTP URLs", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "http://evil.com/malware.tgz", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "http://evil.com/malware.tgz"]),
        {
          message: /Safe-chain: npm package specification "http:\/\/evil\.com\/malware\.tgz" is not a valid npm registry package/,
        }
      );
    });

    it("should reject HTTPS URLs", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "https://attacker.com/package.tgz", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "https://attacker.com/package.tgz"]),
        {
          message: /Safe-chain: npm package specification "https:\/\/attacker\.com\/package\.tgz" is not a valid npm registry package/,
        }
      );
    });

    it("should reject file: URLs", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "file:./local-package.tgz", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "file:./local-package.tgz"]),
        {
          message: /Safe-chain: npm package specification "file:\.\/local-package\.tgz" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("Git-based package specifications", () => {
    it("should reject git:// URLs", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "git://github.com/attacker/malware.git", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "git://github.com/attacker/malware.git"]),
        {
          message: /Safe-chain: npm package specification "git:\/\/github\.com\/attacker\/malware\.git" is not a valid npm registry package/,
        }
      );
    });

    it("should reject git+ssh:// URLs", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "git+ssh://git@github.com/attacker/malware.git", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "git+ssh://git@github.com/attacker/malware.git"]),
        {
          message: /Safe-chain: npm package specification "git\+ssh:\/\/git@github\.com\/attacker\/malware\.git" is not a valid npm registry package/,
        }
      );
    });

    it("should reject git+https:// URLs", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "git+https://github.com/attacker/malware.git", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "git+https://github.com/attacker/malware.git"]),
        {
          message: /Safe-chain: npm package specification "git\+https:\/\/github\.com\/attacker\/malware\.git" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("GitHub/GitLab/Bitbucket shortcuts", () => {
    it("should reject github: shortcuts", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "github:attacker/malware", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "github:attacker/malware"]),
        {
          message: /Safe-chain: npm package specification "github:attacker\/malware" is not a valid npm registry package/,
        }
      );
    });

    it("should reject gitlab: shortcuts", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "gitlab:attacker/malware", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "gitlab:attacker/malware"]),
        {
          message: /Safe-chain: npm package specification "gitlab:attacker\/malware" is not a valid npm registry package/,
        }
      );
    });

    it("should reject bitbucket: shortcuts", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "bitbucket:attacker/malware", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "bitbucket:attacker/malware"]),
        {
          message: /Safe-chain: npm package specification "bitbucket:attacker\/malware" is not a valid npm registry package/,
        }
      );
    });

    it("should reject GitHub shorthand (user/repo)", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "attacker/malware", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "attacker/malware"]),
        {
          message: /Safe-chain: npm package specification "attacker\/malware" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("File path specifications", () => {
    it("should reject relative paths with ./", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "./local-package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "./local-package"]),
        {
          message: /Safe-chain: npm package specification "\.\/local-package" is not a valid npm registry package/,
        }
      );
    });

    it("should reject relative paths with ../", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "../local-package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "../local-package"]),
        {
          message: /Safe-chain: npm package specification "\.\.\/local-package" is not a valid npm registry package/,
        }
      );
    });

    it("should reject absolute paths", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "/absolute/path/package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "/absolute/path/package"]),
        {
          message: /Safe-chain: npm package specification "\/absolute\/path\/package" is not a valid npm registry package/,
        }
      );
    });

    it("should reject home directory paths", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "~/local-package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "~/local-package"]),
        {
          message: /Safe-chain: npm package specification "~\/local-package" is not a valid npm registry package/,
        }
      );
    });

    it("should reject Windows-style paths", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "C:\\packages\\local-package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "C:\\packages\\local-package"]),
        {
          message: /Safe-chain: npm package specification "C:\\packages\\local-package" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("Other protocol-based specifications", () => {
    it("should reject custom protocol specifications", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "custom-protocol://example.com/package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "custom-protocol://example.com/package"]),
        {
          message: /Safe-chain: npm package specification "custom-protocol:\/\/example\.com\/package" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("Valid npm registry packages", () => {
    it("should allow simple package names", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "express", version: "4.17.1" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => "4.17.1");

      const result = await checkChangesFromArgs(["install", "express@4.17.1"]);

      assert.equal(result.length, 1);
      assert.equal(result[0].name, "express");
      assert.equal(result[0].version, "4.17.1");
      assert.equal(result[0].type, "add");
    });

    it("should allow scoped packages", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "@scope/package", version: "1.0.0" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => "1.0.0");

      const result = await checkChangesFromArgs(["install", "@scope/package@1.0.0"]);

      assert.equal(result.length, 1);
      assert.equal(result[0].name, "@scope/package");
      assert.equal(result[0].version, "1.0.0");
      assert.equal(result[0].type, "add");
    });

    it("should allow packages with hyphens and numbers", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "http-server-2", version: "1.0.0" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => "1.0.0");

      const result = await checkChangesFromArgs(["install", "http-server-2@1.0.0"]);

      assert.equal(result.length, 1);
      assert.equal(result[0].name, "http-server-2");
    });
  });

  describe("Registry resolution failure", () => {
    it("should reject packages that cannot be resolved from registry", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "non-existent-package", version: "latest" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => null);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "non-existent-package"]),
        {
          message: /Safe-chain: Unable to resolve package "non-existent-package@latest" from npm registry/,
        }
      );
    });

    it("should reject packages with specific version that cannot be resolved", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "express", version: "999.999.999" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => null);

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "express@999.999.999"]),
        {
          message: /Safe-chain: Unable to resolve package "express@999\.999\.999" from npm registry/,
        }
      );
    });
  });

  describe("Multiple packages", () => {
    it("should reject if any package is non-registry", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "express", version: "4.17.1" },
        { name: "https://evil.com/malware.tgz", version: "latest" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => "4.17.1");

      await assert.rejects(
        async () => await checkChangesFromArgs(["install", "express@4.17.1", "https://evil.com/malware.tgz"]),
        {
          message: /Safe-chain: npm package specification "https:\/\/evil\.com\/malware\.tgz" is not a valid npm registry package/,
        }
      );
    });

    it("should allow multiple valid registry packages", async () => {
      mockParsePackagesFromInstallArgs.mock.mockImplementation(() => [
        { name: "express", version: "4.17.1" },
        { name: "lodash", version: "4.17.21" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation((name, version) => version);

      const result = await checkChangesFromArgs(["install", "express@4.17.1", "lodash@4.17.21"]);

      assert.equal(result.length, 2);
      assert.equal(result[0].name, "express");
      assert.equal(result[1].name, "lodash");
    });
  });
});
