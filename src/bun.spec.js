import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("Bun Security Scanner", async () => {
  const mockAuditChanges = mock.fn();

  // Mock the audit module
  mock.module("./scanning/audit/index.js", {
    namedExports: {
      auditChanges: mockAuditChanges,
    },
  });

  const { scanner } = await import("./bun.js");

  describe("scanner interface compliance", () => {
    it("should export scanner object with version", () => {
      assert.equal(typeof scanner, "object");
      assert.equal(scanner.version, "1");
      assert.equal(typeof scanner.scan, "function");
    });
  });

  describe("scan function", () => {
    it("should return empty advisories for clean packages", async () => {
      mockAuditChanges.mock.resetCalls();
      mockAuditChanges.mock.mockImplementationOnce(() => ({
        isAllowed: true,
        allowedChanges: [{ name: "lodash", version: "4.17.21", type: "add" }],
        disallowedChanges: [],
      }));

      const result = await scanner.scan({
        packages: [{ name: "lodash", version: "4.17.21" }],
      });

      assert.deepEqual(result, []);
      assert.equal(mockAuditChanges.mock.callCount(), 1);
      
      // Verify the package format conversion
      const [changes] = mockAuditChanges.mock.calls[0].arguments;
      assert.deepEqual(changes, [
        { name: "lodash", version: "4.17.21", type: "add" },
      ]);
    });

    it("should return fatal advisories for malicious packages", async () => {
      mockAuditChanges.mock.mockImplementationOnce(() => ({
        isAllowed: false,
        allowedChanges: [],
        disallowedChanges: [
          { 
            name: "evil-package", 
            version: "1.0.0", 
            type: "add", 
            reason: "MALWARE" 
          },
        ],
      }));

      const result = await scanner.scan({
        packages: [{ name: "evil-package", version: "1.0.0" }],
      });

      assert.equal(result.length, 1);
      assert.equal(result[0].level, "fatal");
      assert.equal(result[0].package, "evil-package");
      assert.equal(result[0].url, null);
      assert(result[0].description.includes("evil-package@1.0.0"));
      assert(result[0].description.includes("MALWARE"));
      assert(result[0].description.includes("Safe-Chain"));
    });

    it("should handle multiple packages with mixed results", async () => {
      mockAuditChanges.mock.mockImplementationOnce(() => ({
        isAllowed: false,
        allowedChanges: [
          { name: "lodash", version: "4.17.21", type: "add" },
        ],
        disallowedChanges: [
          { 
            name: "evil-package", 
            version: "1.0.0", 
            type: "add", 
            reason: "MALWARE" 
          },
          { 
            name: "malicious-lib", 
            version: "2.1.0", 
            type: "add", 
            reason: "PROTESTWARE" 
          },
        ],
      }));

      const result = await scanner.scan({
        packages: [
          { name: "lodash", version: "4.17.21" },
          { name: "evil-package", version: "1.0.0" },
          { name: "malicious-lib", version: "2.1.0" },
        ],
      });

      assert.equal(result.length, 2);
      
      // Check first malicious package
      assert.equal(result[0].level, "fatal");
      assert.equal(result[0].package, "evil-package");
      assert(result[0].description.includes("MALWARE"));
      
      // Check second malicious package
      assert.equal(result[1].level, "fatal");
      assert.equal(result[1].package, "malicious-lib");
      assert(result[1].description.includes("PROTESTWARE"));
    });

    it("should handle empty packages array", async () => {
      mockAuditChanges.mock.resetCalls();
      mockAuditChanges.mock.mockImplementationOnce(() => ({
        isAllowed: true,
        allowedChanges: [],
        disallowedChanges: [],
      }));

      const result = await scanner.scan({ packages: [] });

      assert.deepEqual(result, []);
      assert.equal(mockAuditChanges.mock.callCount(), 1);
      
      // Verify empty changes array was passed
      const [changes] = mockAuditChanges.mock.calls[0].arguments;
      assert.deepEqual(changes, []);
    });

    it("should gracefully handle auditChanges errors", async () => {
      const originalConsoleWarn = console.warn;
      let warnMessage = "";
      console.warn = (message) => { warnMessage = message; };

      mockAuditChanges.mock.mockImplementationOnce(() => {
        throw new Error("Network timeout");
      });

      const result = await scanner.scan({
        packages: [{ name: "lodash", version: "4.17.21" }],
      });

      // Should return empty advisories on error (graceful degradation)
      assert.deepEqual(result, []);
      assert(warnMessage.includes("Safe-Chain security scan failed"));
      assert(warnMessage.includes("Network timeout"));

      console.warn = originalConsoleWarn;
    });

    it("should properly convert package format", async () => {
      mockAuditChanges.mock.resetCalls();
      mockAuditChanges.mock.mockImplementationOnce(() => ({
        isAllowed: true,
        allowedChanges: [],
        disallowedChanges: [],
      }));

      await scanner.scan({
        packages: [
          { name: "react", version: "18.2.0" },
          { name: "@types/node", version: "20.0.0" },
        ],
      });

      const [changes] = mockAuditChanges.mock.calls[0].arguments;
      assert.deepEqual(changes, [
        { name: "react", version: "18.2.0", type: "add" },
        { name: "@types/node", version: "20.0.0", type: "add" },
      ]);
    });
  });

  describe("advisory format compliance", () => {
    it("should generate Bun-compliant advisory objects", async () => {
      mockAuditChanges.mock.mockImplementationOnce(() => ({
        isAllowed: false,
        allowedChanges: [],
        disallowedChanges: [
          { 
            name: "test-malware", 
            version: "1.2.3", 
            type: "add", 
            reason: "MALWARE" 
          },
        ],
      }));

      const result = await scanner.scan({
        packages: [{ name: "test-malware", version: "1.2.3" }],
      });

      assert.equal(result.length, 1);
      const advisory = result[0];
      
      // Verify all required Bun advisory fields are present
      assert(Object.prototype.hasOwnProperty.call(advisory, "level"));
      assert(Object.prototype.hasOwnProperty.call(advisory, "package"));
      assert(Object.prototype.hasOwnProperty.call(advisory, "url"));
      assert(Object.prototype.hasOwnProperty.call(advisory, "description"));
      
      // Verify field types and values
      assert.equal(typeof advisory.level, "string");
      assert.equal(typeof advisory.package, "string");
      assert(advisory.url === null || typeof advisory.url === "string");
      assert.equal(typeof advisory.description, "string");
      
      assert.equal(advisory.level, "fatal");
      assert.equal(advisory.package, "test-malware");
    });
  });
});