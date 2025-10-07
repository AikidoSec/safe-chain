import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePnpmLockfile } from "./parsePnpmLockfile.js";

describe("parsePnpmLockfile", () => {
  it("should parse a simple lockfile with regular packages", () => {
    const lockfileContent = `
lockfileVersion: '6.0'
packages:
  /axios/1.9.0:
    version: 1.9.0
    resolution: 'axios@1.9.0'
  /lodash/4.17.21:
    version: 4.17.21
    resolution: 'lodash@4.17.21'
`;

    const result = parsePnpmLockfile(lockfileContent);

    assert.deepEqual(result, [
      { name: "axios", version: "1.9.0", type: "add" },
      { name: "lodash", version: "4.17.21", type: "add" }
    ]);
  });

  it("should parse a lockfile with scoped packages", () => {
    const lockfileContent = `
lockfileVersion: '6.0'
packages:
  /@babel/core/7.23.0:
    version: 7.23.0
    resolution: '@babel/core@7.23.0'
  /@types/node/20.8.0:
    version: 20.8.0
    resolution: '@types/node@20.8.0'
`;

    const result = parsePnpmLockfile(lockfileContent);

    assert.deepEqual(result, [
      { name: "@babel/core", version: "7.23.0", type: "add" },
      { name: "@types/node", version: "20.8.0", type: "add" }
    ]);
  });

  it("should handle empty lockfile", () => {
    const lockfileContent = `
lockfileVersion: '6.0'
packages: {}
`;

    const result = parsePnpmLockfile(lockfileContent);

    assert.deepEqual(result, []);
  });

  it("should handle lockfile with no packages section", () => {
    const lockfileContent = `
lockfileVersion: '6.0'
`;

    const result = parsePnpmLockfile(lockfileContent);

    assert.deepEqual(result, []);
  });

  it("should skip root package entry", () => {
    const lockfileContent = `
lockfileVersion: '6.0'
packages:
  '':
    dependencies:
      axios: 1.9.0
  /axios/1.9.0:
    version: 1.9.0
    resolution: 'axios@1.9.0'
`;

    const result = parsePnpmLockfile(lockfileContent);

    assert.deepEqual(result, [
      { name: "axios", version: "1.9.0", type: "add" }
    ]);
  });

  it("should handle malformed YAML gracefully", () => {
    const lockfileContent = `
lockfileVersion: '6.0'
packages:
  /axios/1.9.0:
    version: 1.9.0
    resolution: 'axios@1.9.0'
  invalid: [yaml: content
`;

    assert.throws(() => {
      parsePnpmLockfile(lockfileContent);
    }, /Failed to parse pnpm lockfile/);
  });

  it("should parse malicious packages from lockfile for security scanning", () => {
    const lockfileContent = `
lockfileVersion: '6.0'
packages:
  /safe-chain-test/0.0.1-security:
    version: 0.0.1-security
    resolution: 'safe-chain-test@0.0.1-security'
  /axios/1.9.0:
    version: 1.9.0
    resolution: 'axios@1.9.0'
  /@types/node/20.8.0:
    version: 20.8.0
    resolution: '@types/node@20.8.0'
`;

    const result = parsePnpmLockfile(lockfileContent);

    assert.strictEqual(result.length, 3);

    // Verify malicious package is detected
    const maliciousPackage = result.find(pkg => pkg.name === "safe-chain-test");
    assert.ok(maliciousPackage, "Malicious package should be detected");
    assert.strictEqual(maliciousPackage.name, "safe-chain-test");
    assert.strictEqual(maliciousPackage.version, "0.0.1-security");
    assert.strictEqual(maliciousPackage.type, "add");

    // Verify regular packages are also detected
    const regularPackage = result.find(pkg => pkg.name === "axios");
    assert.ok(regularPackage, "Regular package should be detected");
    assert.strictEqual(regularPackage.name, "axios");
    assert.strictEqual(regularPackage.version, "1.9.0");
    assert.strictEqual(regularPackage.type, "add");

    // Verify scoped packages are detected
    const scopedPackage = result.find(pkg => pkg.name === "@types/node");
    assert.ok(scopedPackage, "Scoped package should be detected");
    assert.strictEqual(scopedPackage.name, "@types/node");
    assert.strictEqual(scopedPackage.version, "20.8.0");
    assert.strictEqual(scopedPackage.type, "add");
  });
});
