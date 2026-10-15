import assert from "node:assert/strict";
import { describe, it, mock, beforeEach } from "node:test";

describe("npx/commandArgumentScanner - non-registry package specification security", async () => {
  // Mock resolvePackageVersion to control resolution behavior
  const mockResolvePackageVersion = mock.fn();
  
  mock.module("../../../api/npmApi.js", {
    namedExports: {
      resolvePackageVersion: mockResolvePackageVersion,
    },
  });

  // Mock parsePackagesFromArguments to return controlled package specs
  const mockParsePackagesFromArguments = mock.fn();
  
  mock.module("../parsing/parsePackagesFromArguments.js", {
    namedExports: {
      parsePackagesFromArguments: mockParsePackagesFromArguments,
    },
  });

  const { checkChangesFromArgs } = await import("./commandArgumentScanner.js");

  beforeEach(() => {
    mockResolvePackageVersion.mock.resetCalls();
    mockParsePackagesFromArguments.mock.resetCalls();
  });

  describe("URL-based package specifications", () => {
    it("should reject HTTP URLs", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "http://evil.com/malware.tgz", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["http://evil.com/malware.tgz"]),
        {
          message: /Safe-chain: npx package specification "http:\/\/evil\.com\/malware\.tgz" is not a valid npm registry package/,
        }
      );
    });

    it("should reject HTTPS URLs", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "https://attacker.com/package.tgz", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["https://attacker.com/package.tgz"]),
        {
          message: /Safe-chain: npx package specification "https:\/\/attacker\.com\/package\.tgz" is not a valid npm registry package/,
        }
      );
    });

    it("should reject file: URLs", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "file:./local-package.tgz", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["file:./local-package.tgz"]),
        {
          message: /Safe-chain: npx package specification "file:\.\/local-package\.tgz" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("Git-based package specifications", () => {
    it("should reject git:// URLs", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "git://github.com/attacker/malware.git", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["git://github.com/attacker/malware.git"]),
        {
          message: /Safe-chain: npx package specification "git:\/\/github\.com\/attacker\/malware\.git" is not a valid npm registry package/,
        }
      );
    });

    it("should reject git+ssh:// URLs", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "git+ssh://git@github.com/attacker/malware.git", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["git+ssh://git@github.com/attacker/malware.git"]),
        {
          message: /Safe-chain: npx package specification "git\+ssh:\/\/git@github\.com\/attacker\/malware\.git" is not a valid npm registry package/,
        }
      );
    });

    it("should reject git+https:// URLs", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "git+https://github.com/attacker/malware.git", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["git+https://github.com/attacker/malware.git"]),
        {
          message: /Safe-chain: npx package specification "git\+https:\/\/github\.com\/attacker\/malware\.git" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("GitHub/GitLab/Bitbucket shortcuts", () => {
    it("should reject github: shortcuts", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "github:attacker/malware", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["github:attacker/malware"]),
        {
          message: /Safe-chain: npx package specification "github:attacker\/malware" is not a valid npm registry package/,
        }
      );
    });

    it("should reject gitlab: shortcuts", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "gitlab:attacker/malware", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["gitlab:attacker/malware"]),
        {
          message: /Safe-chain: npx package specification "gitlab:attacker\/malware" is not a valid npm registry package/,
        }
      );
    });

    it("should reject bitbucket: shortcuts", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "bitbucket:attacker/malware", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["bitbucket:attacker/malware"]),
        {
          message: /Safe-chain: npx package specification "bitbucket:attacker\/malware" is not a valid npm registry package/,
        }
      );
    });

    it("should reject GitHub shorthand (user/repo)", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "attacker/malware", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["attacker/malware"]),
        {
          message: /Safe-chain: npx package specification "attacker\/malware" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("File path specifications", () => {
    it("should reject relative paths with ./", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "./local-package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["./local-package"]),
        {
          message: /Safe-chain: npx package specification "\.\/local-package" is not a valid npm registry package/,
        }
      );
    });

    it("should reject relative paths with ../", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "../local-package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["../local-package"]),
        {
          message: /Safe-chain: npx package specification "\.\.\/local-package" is not a valid npm registry package/,
        }
      );
    });

    it("should reject absolute paths", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "/absolute/path/package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["/absolute/path/package"]),
        {
          message: /Safe-chain: npx package specification "\/absolute\/path\/package" is not a valid npm registry package/,
        }
      );
    });

    it("should reject home directory paths", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "~/local-package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["~/local-package"]),
        {
          message: /Safe-chain: npx package specification "~\/local-package" is not a valid npm registry package/,
        }
      );
    });

    it("should reject Windows-style paths", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "C:\\packages\\local-package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["C:\\packages\\local-package"]),
        {
          message: /Safe-chain: npx package specification "C:\\packages\\local-package" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("Other protocol-based specifications", () => {
    it("should reject custom protocol specifications", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "custom-protocol://example.com/package", version: "latest" },
      ]);

      await assert.rejects(
        async () => await checkChangesFromArgs(["custom-protocol://example.com/package"]),
        {
          message: /Safe-chain: npx package specification "custom-protocol:\/\/example\.com\/package" is not a valid npm registry package/,
        }
      );
    });
  });

  describe("Valid npm registry packages", () => {
    it("should allow simple package names", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "http-server", version: "14.1.1" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => "14.1.1");

      const result = await checkChangesFromArgs(["http-server@14.1.1"]);

      assert.equal(result.length, 1);
      assert.equal(result[0].name, "http-server");
      assert.equal(result[0].version, "14.1.1");
      assert.equal(result[0].type, "add");
    });

    it("should allow scoped packages", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "@vercel/otel", version: "1.0.0" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => "1.0.0");

      const result = await checkChangesFromArgs(["@vercel/otel@1.0.0"]);

      assert.equal(result.length, 1);
      assert.equal(result[0].name, "@vercel/otel");
      assert.equal(result[0].version, "1.0.0");
      assert.equal(result[0].type, "add");
    });

    it("should allow packages with hyphens and numbers", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "http-server-2", version: "1.0.0" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => "1.0.0");

      const result = await checkChangesFromArgs(["http-server-2@1.0.0"]);

      assert.equal(result.length, 1);
      assert.equal(result[0].name, "http-server-2");
    });
  });

  describe("Registry resolution failure", () => {
    it("should reject packages that cannot be resolved from registry", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "non-existent-package", version: "latest" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => null);

      await assert.rejects(
        async () => await checkChangesFromArgs(["non-existent-package"]),
        {
          message: /Safe-chain: Unable to resolve package "non-existent-package@latest" from npm registry/,
        }
      );
    });

    it("should reject packages with specific version that cannot be resolved", async () => {
      mockParsePackagesFromArguments.mock.mockImplementation(() => [
        { name: "http-server", version: "999.999.999" },
      ]);
      mockResolvePackageVersion.mock.mockImplementation(() => null);

      await assert.rejects(
        async () => await checkChangesFromArgs(["http-server@999.999.999"]),
        {
          message: /Safe-chain: Unable to resolve package "http-server@999\.999\.999" from npm registry/,
        }
      );
    });
  });
});
