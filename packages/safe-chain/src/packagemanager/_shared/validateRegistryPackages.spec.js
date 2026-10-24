import { describe, it } from "node:test";
import assert from "node:assert";
import { isValidRegistryPackageName, validateRegistryPackages } from "./validateRegistryPackages.js";

describe("isValidRegistryPackageName", () => {
  describe("valid registry package names", () => {
    it("should accept simple package names", () => {
      assert.strictEqual(isValidRegistryPackageName("express"), true);
    });

    it("should accept scoped package names", () => {
      assert.strictEqual(isValidRegistryPackageName("@scope/package"), true);
    });

    it("should accept package names with hyphens", () => {
      assert.strictEqual(isValidRegistryPackageName("my-package"), true);
    });

    it("should accept package names with underscores", () => {
      assert.strictEqual(isValidRegistryPackageName("my_package"), true);
    });

    it("should accept package names with dots", () => {
      assert.strictEqual(isValidRegistryPackageName("my.package"), true);
    });
  });

  describe("HTTP(S) URLs - pentest finding mitigation", () => {
    it("should reject HTTP URLs", () => {
      assert.strictEqual(isValidRegistryPackageName("http://example.com/package.tgz"), false);
    });

    it("should reject HTTPS URLs", () => {
      assert.strictEqual(isValidRegistryPackageName("https://example.com/package.tgz"), false);
    });

    it("should reject HTTPS URLs without file extension", () => {
      assert.strictEqual(isValidRegistryPackageName("https://malicious.com/payload"), false);
    });

    it("should reject HTTP URLs with registry-like paths", () => {
      assert.strictEqual(isValidRegistryPackageName("http://registry.npmjs.org/package"), false);
    });
  });

  describe("Git locators - pentest finding mitigation", () => {
    it("should reject git:// URLs", () => {
      assert.strictEqual(isValidRegistryPackageName("git://github.com/user/repo.git"), false);
    });

    it("should reject git+ssh:// URLs", () => {
      assert.strictEqual(isValidRegistryPackageName("git+ssh://git@github.com/user/repo.git"), false);
    });

    it("should reject git+https:// URLs", () => {
      assert.strictEqual(isValidRegistryPackageName("git+https://github.com/user/repo.git"), false);
    });

    it("should reject git+http:// URLs", () => {
      assert.strictEqual(isValidRegistryPackageName("git+http://github.com/user/repo.git"), false);
    });

    it("should reject github: shorthand", () => {
      assert.strictEqual(isValidRegistryPackageName("github:user/repo"), false);
    });

    it("should reject gitlab: shorthand", () => {
      assert.strictEqual(isValidRegistryPackageName("gitlab:user/repo"), false);
    });

    it("should reject bitbucket: shorthand", () => {
      assert.strictEqual(isValidRegistryPackageName("bitbucket:user/repo"), false);
    });
  });

  describe("File paths - pentest finding mitigation", () => {
    it("should reject file: protocol", () => {
      assert.strictEqual(isValidRegistryPackageName("file:./local-package.tgz"), false);
    });

    it("should reject relative paths with ./", () => {
      assert.strictEqual(isValidRegistryPackageName("./local-package"), false);
    });

    it("should reject relative paths with ../", () => {
      assert.strictEqual(isValidRegistryPackageName("../local-package"), false);
    });

    it("should reject absolute Unix paths", () => {
      assert.strictEqual(isValidRegistryPackageName("/usr/local/package"), false);
    });

    it("should reject Windows absolute paths with backslash", () => {
      assert.strictEqual(isValidRegistryPackageName("C:\\Users\\package"), false);
    });

    it("should reject Windows absolute paths with forward slash", () => {
      assert.strictEqual(isValidRegistryPackageName("C:/Users/package"), false);
    });

    it("should reject Windows absolute paths with different drive letters", () => {
      assert.strictEqual(isValidRegistryPackageName("D:\\package"), false);
      assert.strictEqual(isValidRegistryPackageName("E:/package"), false);
    });
  });
});

describe("validateRegistryPackages", () => {
  describe("valid packages", () => {
    it("should not throw for valid registry packages", () => {
      const packages = [
        { name: "express", version: "4.17.1" },
        { name: "@scope/package", version: "1.0.0" },
      ];

      assert.doesNotThrow(() => validateRegistryPackages(packages));
    });

    it("should not throw for empty array", () => {
      assert.doesNotThrow(() => validateRegistryPackages([]));
    });
  });

  describe("HTTP(S) URL rejection - pentest exploit scenario", () => {
    it("should throw for HTTPS tarball URL", () => {
      const packages = [
        { name: "https://example.com/malicious.tgz", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /Non-registry package specifications are not supported for security reasons/,
        }
      );
    });

    it("should throw for HTTP URL", () => {
      const packages = [
        { name: "http://attacker.com/payload.tgz", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /appears to be a URL, Git locator, or file path/,
        }
      );
    });

    it("should include the malicious package name in error message", () => {
      const packages = [
        { name: "https://evil.com/backdoor.tgz", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /https:\/\/evil\.com\/backdoor\.tgz/,
        }
      );
    });
  });

  describe("Git locator rejection - pentest exploit scenario", () => {
    it("should throw for git:// URL", () => {
      const packages = [
        { name: "git://github.com/attacker/malware.git", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should throw for github: shorthand", () => {
      const packages = [
        { name: "github:attacker/malware", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should throw for git+https:// URL", () => {
      const packages = [
        { name: "git+https://github.com/attacker/malware.git", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("File path rejection - pentest exploit scenario", () => {
    it("should throw for file: protocol", () => {
      const packages = [
        { name: "file:./malicious.tgz", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should throw for relative path", () => {
      const packages = [
        { name: "./local-package", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should throw for absolute path", () => {
      const packages = [
        { name: "/tmp/malicious-package", version: "latest" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("mixed packages - fail-closed behavior", () => {
    it("should throw when one package is invalid among valid ones", () => {
      const packages = [
        { name: "express", version: "4.17.1" },
        { name: "https://evil.com/malware.tgz", version: "latest" },
        { name: "lodash", version: "4.17.21" },
      ];

      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should throw on first invalid package", () => {
      const packages = [
        { name: "git://github.com/attacker/repo.git", version: "latest" },
        { name: "https://evil.com/malware.tgz", version: "latest" },
      ];

      // Should throw on the first invalid package
      assert.throws(
        () => validateRegistryPackages(packages),
        {
          message: /git:\/\/github\.com\/attacker\/repo\.git/,
        }
      );
    });
  });

  describe("security property - fail-closed enforcement", () => {
    it("should enforce fail-closed behavior for unrecognized specifications", () => {
      // This test verifies that the mitigation prevents the "fail open" vulnerability
      // where unresolved packages were allowed by default
      const suspiciousPackages = [
        { name: "https://attacker.com/payload.tgz", version: "latest" },
        { name: "git://github.com/evil/repo.git", version: "latest" },
        { name: "file:../../../etc/passwd", version: "latest" },
      ];

      for (const pkg of suspiciousPackages) {
        assert.throws(
          () => validateRegistryPackages([pkg]),
          {
            message: /Non-registry package specifications are not supported/,
          },
          `Should reject non-registry package: ${pkg.name}`
        );
      }
    });

    it("should prevent bypass via synthetic package identities", () => {
      // This test addresses the core vulnerability: synthetic identities
      // created from non-registry specs should be rejected before audit
      const syntheticIdentities = [
        { name: "https://registry.npmjs.org/malware/-/malware-1.0.0.tgz", version: "latest" },
        { name: "http://localhost:8080/backdoor.tgz", version: "1.0.0" },
      ];

      for (const pkg of syntheticIdentities) {
        assert.throws(
          () => validateRegistryPackages([pkg]),
          {
            message: /Non-registry package specifications are not supported/,
          },
          `Should reject synthetic identity: ${pkg.name}`
        );
      }
    });
  });
});
