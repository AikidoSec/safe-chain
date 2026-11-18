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

// Import after mocking
const { commandArgumentScanner } = await import("./commandArgumentScanner.js");

describe("yarn commandArgumentScanner - non-registry package spec security", () => {

  describe("should reject HTTP/HTTPS URLs", () => {
    it("should reject https tarball URL", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "https://example.com/malicious-package.tgz"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: https:\/\/example\.com\/malicious-package\.tgz/,
        }
      );
    });

    it("should reject http tarball URL", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "http://evil.com/package.tgz"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: http:\/\/evil\.com\/package\.tgz/,
        }
      );
    });
  });

  describe("should reject Git specifications", () => {
    it("should reject git:// protocol", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "git://github.com/user/malicious-repo.git"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: git:\/\/github\.com\/user\/malicious-repo\.git/,
        }
      );
    });

    it("should reject git+https:// protocol", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "git+https://github.com/user/repo.git"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: git\+https:\/\/github\.com\/user\/repo\.git/,
        }
      );
    });

    it("should reject github: shortcut", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "github:user/malicious-repo"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: github:user\/malicious-repo/,
        }
      );
    });

    it("should reject bitbucket: shortcut", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "bitbucket:user/repo"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: bitbucket:user\/repo/,
        }
      );
    });
  });

  describe("should reject file paths", () => {
    it("should reject file: protocol", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "file:./local-package.tgz"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: file:\.\/local-package\.tgz/,
        }
      );
    });

    it("should reject relative path with ./", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "./local-package"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \.\/local-package/,
        }
      );
    });

    it("should reject relative path with ../", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "../parent-package"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \.\.\/parent-package/,
        }
      );
    });

    it("should reject absolute Unix path", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "/absolute/path/to/package"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \/absolute\/path\/to\/package/,
        }
      );
    });
  });

  describe("should allow valid registry packages", () => {
    it("should allow simple package name", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "lodash"];
      
      const result = await scanner.scan(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "lodash");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow scoped package", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "@babel/core"];
      
      const result = await scanner.scan(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "@babel/core");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow package with version", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "express@4.17.1"];
      
      const result = await scanner.scan(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "express");
      assert.strictEqual(result[0].version, "4.17.1");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow multiple valid registry packages", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "lodash@4.17.21", "express@4.17.1"];
      
      const result = await scanner.scan(args);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, "lodash");
      assert.strictEqual(result[1].name, "express");
    });
  });

  describe("should provide clear error messages", () => {
    it("should mention malware scanning in error message", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "https://evil.com/package.tgz"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /can be scanned for malware/,
        }
      );
    });

    it("should mention registry-only support in error message", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "git://github.com/user/repo.git"];
      
      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Only packages from the npm registry/,
        }
      );
    });
  });
});
