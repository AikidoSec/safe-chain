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

describe("npm commandArgumentScanner - non-registry package spec security", () => {

  describe("should reject HTTP/HTTPS URLs", () => {
    it("should reject https tarball URL", async () => {
      const args = ["install", "https://example.com/malicious-package.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: https:\/\/example\.com\/malicious-package\.tgz/,
        }
      );
    });

    it("should reject http tarball URL", async () => {
      const args = ["install", "http://evil.com/package.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: http:\/\/evil\.com\/package\.tgz/,
        }
      );
    });

    it("should reject HTTPS URL with query parameters", async () => {
      const args = ["install", "https://registry.example.com/package.tgz?token=abc123"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source/,
        }
      );
    });
  });

  describe("should reject Git specifications", () => {
    it("should reject git:// protocol", async () => {
      const args = ["install", "git://github.com/user/malicious-repo.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: git:\/\/github\.com\/user\/malicious-repo\.git/,
        }
      );
    });

    it("should reject git+https:// protocol", async () => {
      const args = ["install", "git+https://github.com/user/repo.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: git\+https:\/\/github\.com\/user\/repo\.git/,
        }
      );
    });

    it("should reject git+ssh:// protocol", async () => {
      const args = ["install", "git+ssh://git@github.com/user/repo.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: git\+ssh:\/\/git@github\.com\/user\/repo\.git/,
        }
      );
    });

    it("should reject github: shortcut", async () => {
      const args = ["install", "github:user/malicious-repo"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: github:user\/malicious-repo/,
        }
      );
    });

    it("should reject gitlab: shortcut", async () => {
      const args = ["install", "gitlab:user/repo"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: gitlab:user\/repo/,
        }
      );
    });

    it("should reject bitbucket: shortcut", async () => {
      const args = ["install", "bitbucket:user/repo"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: bitbucket:user\/repo/,
        }
      );
    });

    it("should reject gist: shortcut", async () => {
      const args = ["install", "gist:abc123"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: gist:abc123/,
        }
      );
    });
  });

  describe("should reject file paths", () => {
    it("should reject file: protocol", async () => {
      const args = ["install", "file:./local-package.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: file:\.\/local-package\.tgz/,
        }
      );
    });

    it("should reject relative path with ./", async () => {
      const args = ["install", "./local-package"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \.\/local-package/,
        }
      );
    });

    it("should reject relative path with ../", async () => {
      const args = ["install", "../parent-package"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \.\.\/parent-package/,
        }
      );
    });

    it("should reject absolute Unix path", async () => {
      const args = ["install", "/absolute/path/to/package"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \/absolute\/path\/to\/package/,
        }
      );
    });

    it("should reject absolute Windows path with drive letter", async () => {
      const args = ["install", "C:\\Users\\packages\\malicious"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: C:\\Users\\packages\\malicious/,
        }
      );
    });

    it("should reject UNC path", async () => {
      const args = ["install", "\\\\server\\share\\package"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: \\\\server\\share\\package/,
        }
      );
    });
  });

  describe("should reject multiple non-registry packages", () => {
    it("should reject when first package is non-registry", async () => {
      const args = ["install", "https://evil.com/malware.tgz", "lodash"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: https:\/\/evil\.com\/malware\.tgz/,
        }
      );
    });

    it("should reject when second package is non-registry", async () => {
      const args = ["install", "lodash", "git://github.com/evil/repo.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source: git:\/\/github\.com\/evil\/repo\.git/,
        }
      );
    });

    it("should reject when all packages are non-registry", async () => {
      const args = ["install", "https://evil.com/pkg1.tgz", "./local-pkg"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source/,
        }
      );
    });
  });

  describe("should allow valid registry packages", () => {
    it("should allow simple package name", async () => {
      const args = ["install", "lodash"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "lodash");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow scoped package", async () => {
      const args = ["install", "@babel/core"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "@babel/core");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow package with version", async () => {
      const args = ["install", "express@4.17.1"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "express");
      assert.strictEqual(result[0].version, "4.17.1");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow package with semver range", async () => {
      const args = ["install", "react@^18.0.0"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "react");
      assert.strictEqual(result[0].version, "^18.0.0");
      assert.strictEqual(result[0].type, "add");
    });

    it("should allow multiple valid registry packages", async () => {
      const args = ["install", "lodash@4.17.21", "express@4.17.1"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, "lodash");
      assert.strictEqual(result[1].name, "express");
    });
  });

  describe("should provide clear error messages", () => {
    it("should mention malware scanning in error message", async () => {
      const args = ["install", "https://evil.com/package.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /can be scanned for malware/,
        }
      );
    });

    it("should mention registry-only support in error message", async () => {
      const args = ["install", "git://github.com/user/repo.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Only packages from the npm registry/,
        }
      );
    });

    it("should list unsupported sources in error message", async () => {
      const args = ["install", "./local-package"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Direct URLs, Git repositories, file paths, and tarballs are not supported/,
        }
      );
    });
  });

  describe("edge cases and protocol variations", () => {
    it("should reject ftp:// protocol", async () => {
      const args = ["install", "ftp://server.com/package.tgz"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source/,
        }
      );
    });

    it("should reject ssh:// protocol", async () => {
      const args = ["install", "ssh://git@server.com/repo.git"];
      
      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Safe-chain: Cannot install package from non-registry source/,
        }
      );
    });

    it("should allow package names that contain 'http' but are not URLs", async () => {
      const args = ["install", "http-proxy"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "http-proxy");
    });

    it("should allow package names that contain 'git' but are not Git specs", async () => {
      const args = ["install", "isomorphic-git"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "isomorphic-git");
    });

    it("should allow package names that contain 'file' but are not file paths", async () => {
      const args = ["install", "file-saver"];
      
      const result = await checkChangesFromArgs(args);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "file-saver");
    });
  });
});
