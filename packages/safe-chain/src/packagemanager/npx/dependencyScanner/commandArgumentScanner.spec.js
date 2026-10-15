import { describe, it, mock } from "node:test";
import assert from "node:assert";

// Mock the resolvePackageVersion to avoid actual network calls
mock.module("../../../api/npmApi.js", {
  namedExports: {
    resolvePackageVersion: async (name, version) => {
      // Return a resolved version for valid registry packages
      if (name.startsWith("http") || name.startsWith("git") || name.startsWith(".") || name.startsWith("/")) {
        return null;
      }
      return version === "latest" ? "1.0.0" : version;
    },
  },
});

const { checkChangesFromArgs } = await import("./commandArgumentScanner.js");

describe("npx commandArgumentScanner - non-registry package spec security", () => {

  describe("should reject HTTP/HTTPS URLs", () => {
    it("should reject https tarball URL", async () => {
      const args = ["https://example.com/malicious-cli.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: https:\/\/example\.com\/malicious-cli\.tgz/,
        }
      );
    });

    it("should reject http tarball URL", async () => {
      const args = ["http://evil.com/cli-tool.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: http:\/\/evil\.com\/cli-tool\.tgz/,
        }
      );
    });
  });

  describe("should reject Git specifications", () => {
    it("should reject git:// protocol", async () => {
      const args = ["git://github.com/user/malicious-cli.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: git:\/\/github\.com\/user\/malicious-cli\.git/,
        }
      );
    });

    it("should reject git+https:// protocol", async () => {
      const args = ["git+https://github.com/user/cli-tool.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: git\+https:\/\/github\.com\/user\/cli-tool\.git/,
        }
      );
    });

    it("should reject github: shortcut", async () => {
      const args = ["github:user/malicious-cli"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: github:user\/malicious-cli/,
        }
      );
    });

    it("should reject gitlab: shortcut", async () => {
      const args = ["gitlab:user/cli-tool"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: gitlab:user\/cli-tool/,
        }
      );
    });
  });

  describe("should reject file paths", () => {
    it("should reject file: protocol", async () => {
      const args = ["file:./local-cli.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: file:\.\/local-cli\.tgz/,
        }
      );
    });

    it("should reject relative path with ./", async () => {
      const args = ["./local-cli"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \.\/local-cli/,
        }
      );
    });

    it("should reject relative path with ../", async () => {
      const args = ["../parent-cli"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \.\.\/parent-cli/,
        }
      );
    });

    it("should reject absolute Unix path", async () => {
      const args = ["/usr/local/bin/malicious-cli"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \/usr\/local\/bin\/malicious-cli/,
        }
      );
    });
  });

  describe("should allow valid registry packages", () => {
    it("should allow simple package name", async () => {
      const args = ["create-react-app"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "create-react-app");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow scoped package", async () => {
      const args = ["@angular/cli"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "@angular/cli");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow package with version", async () => {
      const args = ["typescript@5.0.0"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "typescript");
      assert.strictEqual(result[0].version, "5.0.0");
      assert.strictEqual(result[0].type, "add");
    });
  });

  describe("should provide clear error messages", () => {
    it("should mention malware scanning in error message", async () => {
      const args = ["https://evil.com/cli.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /can be scanned for malware/,
        }
      );
    });

    it("should mention registry-only support in error message", async () => {
      const args = ["git://github.com/user/repo.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Only packages from the npm registry/,
        }
      );
    });
  });
});
