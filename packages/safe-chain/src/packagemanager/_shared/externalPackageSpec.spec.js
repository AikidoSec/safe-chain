import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isExternalPackageSpec,
  validateNotExternalPackageSpec,
} from "./externalPackageSpec.js";

describe("isExternalPackageSpec", () => {
  describe("Git protocol URLs", () => {
    it("detects git:// protocol", () => {
      assert.strictEqual(
        isExternalPackageSpec("git://github.com/user/repo.git"),
        true
      );
    });

    it("detects git+ssh:// protocol", () => {
      assert.strictEqual(
        isExternalPackageSpec("git+ssh://git@github.com/user/repo.git"),
        true
      );
    });

    it("detects git+https:// protocol", () => {
      assert.strictEqual(
        isExternalPackageSpec("git+https://github.com/user/repo.git"),
        true
      );
    });

    it("detects git+http:// protocol", () => {
      assert.strictEqual(
        isExternalPackageSpec("git+http://github.com/user/repo.git"),
        true
      );
    });
  });

  describe("Git hosting shortcuts", () => {
    it("detects github: shortcut", () => {
      assert.strictEqual(isExternalPackageSpec("github:user/repo"), true);
    });

    it("detects gitlab: shortcut", () => {
      assert.strictEqual(isExternalPackageSpec("gitlab:user/repo"), true);
    });

    it("detects bitbucket: shortcut", () => {
      assert.strictEqual(isExternalPackageSpec("bitbucket:user/repo"), true);
    });
  });

  describe("HTTP(S) URLs", () => {
    it("detects https:// URLs", () => {
      assert.strictEqual(
        isExternalPackageSpec("https://example.com/package.tgz"),
        true
      );
    });

    it("detects http:// URLs", () => {
      assert.strictEqual(
        isExternalPackageSpec("http://example.com/package.tgz"),
        true
      );
    });

    it("detects https:// URLs with attacker-controlled domain", () => {
      assert.strictEqual(
        isExternalPackageSpec("https://malicious.attacker.com/malware.tgz"),
        true
      );
    });
  });

  describe("File paths", () => {
    it("detects file: protocol", () => {
      assert.strictEqual(isExternalPackageSpec("file:../package"), true);
    });

    it("detects relative paths with ./", () => {
      assert.strictEqual(isExternalPackageSpec("./local-package"), true);
    });

    it("detects relative paths with ../", () => {
      assert.strictEqual(isExternalPackageSpec("../local-package"), true);
    });

    it("detects absolute paths", () => {
      assert.strictEqual(isExternalPackageSpec("/tmp/package"), true);
    });
  });

  describe("Valid npm registry packages", () => {
    it("allows simple package names", () => {
      assert.strictEqual(isExternalPackageSpec("express"), false);
    });

    it("allows scoped package names", () => {
      assert.strictEqual(isExternalPackageSpec("@aikidosec/firewall"), false);
    });

    it("allows package names with versions", () => {
      assert.strictEqual(isExternalPackageSpec("express@4.18.0"), false);
    });

    it("allows scoped packages with versions", () => {
      assert.strictEqual(
        isExternalPackageSpec("@aikidosec/firewall@1.0.0"),
        false
      );
    });

    it("allows package names with version ranges", () => {
      assert.strictEqual(isExternalPackageSpec("express@^4.0.0"), false);
    });

    it("allows package names with latest tag", () => {
      assert.strictEqual(isExternalPackageSpec("express@latest"), false);
    });
  });

  describe("Edge cases", () => {
    it("returns false for null", () => {
      assert.strictEqual(isExternalPackageSpec(null), false);
    });

    it("returns false for undefined", () => {
      assert.strictEqual(isExternalPackageSpec(undefined), false);
    });

    it("returns false for empty string", () => {
      assert.strictEqual(isExternalPackageSpec(""), false);
    });

    it("returns false for non-string values", () => {
      assert.strictEqual(isExternalPackageSpec(123), false);
      assert.strictEqual(isExternalPackageSpec({}), false);
      assert.strictEqual(isExternalPackageSpec([]), false);
    });
  });
});

describe("validateNotExternalPackageSpec", () => {
  describe("Security: blocks external package specifications", () => {
    it("throws for git:// protocol (pentest scenario)", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec(
            "git://github.com/attacker/malware.git",
            "pnpx"
          );
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications for pnpx/,
        }
      );
    });

    it("throws for git+https:// protocol (pentest scenario)", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec(
            "git+https://github.com/attacker/malware.git",
            "pnpx"
          );
        },
        {
          name: "Error",
          message: /appears to be from a Git repository/,
        }
      );
    });

    it("throws for github: shortcut (pentest scenario)", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec("github:attacker/malware", "pnpx");
        },
        {
          name: "Error",
          message: /appears to be from a Git repository/,
        }
      );
    });

    it("throws for https:// URLs (pentest scenario)", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec(
            "https://attacker.com/malware.tgz",
            "pnpx"
          );
        },
        {
          name: "Error",
          message: /HTTPS URL/,
        }
      );
    });

    it("throws for http:// URLs (pentest scenario)", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec(
            "http://attacker.com/malware.tgz",
            "pnpx"
          );
        },
        {
          name: "Error",
          message: /HTTPS URL/,
        }
      );
    });

    it("throws for file paths (pentest scenario)", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec("./local-package", "pnpx");
        },
        {
          name: "Error",
          message: /file path/,
        }
      );
    });

    it("includes package manager name in error message", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec(
            "git://github.com/attacker/malware.git",
            "npm"
          );
        },
        {
          name: "Error",
          message: /for npm/,
        }
      );
    });

    it("includes package specification in error message", () => {
      const maliciousSpec = "https://evil.com/backdoor.tgz";
      assert.throws(
        () => {
          validateNotExternalPackageSpec(maliciousSpec, "npx");
        },
        {
          name: "Error",
          message: new RegExp(maliciousSpec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        }
      );
    });

    it("explains security rationale in error message", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec(
            "git://github.com/attacker/malware.git",
            "pnpx"
          );
        },
        {
          name: "Error",
          message: /Safe-chain can only scan packages from the npm registry/,
        }
      );
    });

    it("mentions bypass prevention in error message", () => {
      assert.throws(
        () => {
          validateNotExternalPackageSpec(
            "https://attacker.com/malware.tgz",
            "pnpx"
          );
        },
        {
          name: "Error",
          message: /External sources bypass malware scanning and are blocked for security/,
        }
      );
    });
  });

  describe("Security: allows npm registry packages", () => {
    it("does not throw for simple package names", () => {
      assert.doesNotThrow(() => {
        validateNotExternalPackageSpec("express", "pnpx");
      });
    });

    it("does not throw for scoped packages", () => {
      assert.doesNotThrow(() => {
        validateNotExternalPackageSpec("@aikidosec/firewall", "pnpx");
      });
    });

    it("does not throw for packages with versions", () => {
      assert.doesNotThrow(() => {
        validateNotExternalPackageSpec("express@4.18.0", "pnpx");
      });
    });

    it("does not throw for packages with version ranges", () => {
      assert.doesNotThrow(() => {
        validateNotExternalPackageSpec("express@^4.0.0", "pnpx");
      });
    });
  });

  describe("Works with all package managers", () => {
    const externalSpec = "git://github.com/attacker/malware.git";

    it("validates for npm", () => {
      assert.throws(() => {
        validateNotExternalPackageSpec(externalSpec, "npm");
      });
    });

    it("validates for npx", () => {
      assert.throws(() => {
        validateNotExternalPackageSpec(externalSpec, "npx");
      });
    });

    it("validates for pnpm", () => {
      assert.throws(() => {
        validateNotExternalPackageSpec(externalSpec, "pnpm");
      });
    });

    it("validates for pnpx", () => {
      assert.throws(() => {
        validateNotExternalPackageSpec(externalSpec, "pnpx");
      });
    });

    it("validates for yarn", () => {
      assert.throws(() => {
        validateNotExternalPackageSpec(externalSpec, "yarn");
      });
    });

    it("validates for rush", () => {
      assert.throws(() => {
        validateNotExternalPackageSpec(externalSpec, "rush");
      });
    });
  });
});
