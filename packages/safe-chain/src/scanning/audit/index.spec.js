import assert from "node:assert/strict";
import { describe, it, mock, beforeEach } from "node:test";

describe("audit/index", async () => {
  const mockWriteVerbose = mock.fn();

  // Mock UI module
  mock.module("../../environment/userInteraction.js", {
    namedExports: {
      ui: {
        writeVerbose: mockWriteVerbose,
      },
    },
  });

  // Mock malware database
  const mockIsMalware = mock.fn();
  mock.module("../malwareDatabase.js", {
    namedExports: {
      MALWARE_STATUS_MALWARE: "malware",
      openMalwareDatabase: async () => ({
        isMalware: mockIsMalware,
      }),
    },
  });

  // Mock ecosystem settings - defaults to js, overridden per-test
  let ecosystem = "js";
  mock.module("../../config/settings.js", {
    namedExports: {
      getEcoSystem: () => ecosystem,
      ECOSYSTEM_PY: "py",
      ECOSYSTEM_JS: "js",
    },
  });

  const { auditChanges, getAuditStats } = await import("./index.js");

  beforeEach(() => {
    ecosystem = "js";
    mockWriteVerbose.mock.resetCalls();
    mockIsMalware.mock.resetCalls();
  });

  describe("getAuditStats", () => {
    it("should return audit stats object with correct structure", () => {
      const stats = getAuditStats();

      assert.ok(stats.hasOwnProperty("totalPackages"));
      assert.ok(stats.hasOwnProperty("safePackages"));
      assert.ok(stats.hasOwnProperty("malwarePackages"));
      assert.equal(typeof stats.totalPackages, "number");
      assert.equal(typeof stats.safePackages, "number");
      assert.equal(typeof stats.malwarePackages, "number");
    });

    it("should return the same object reference on multiple calls", () => {
      const stats1 = getAuditStats();
      const stats2 = getAuditStats();

      assert.equal(stats1, stats2);
    });
  });

  describe("auditChanges", () => {
    it("should return empty allowed and disallowed arrays when no changes provided", async () => {
      const result = await auditChanges([]);

      assert.deepEqual(result.allowedChanges, []);
      assert.deepEqual(result.disallowedChanges, []);
      assert.equal(result.isAllowed, true);
    });

    it("should mark package as allowed when not malware", async () => {
      mockIsMalware.mock.mockImplementation(() => false);

      const changes = [{ name: "lodash", version: "4.17.21", type: "add" }];
      const result = await auditChanges(changes);

      assert.equal(result.allowedChanges.length, 1);
      assert.equal(result.disallowedChanges.length, 0);
      assert.equal(result.isAllowed, true);
      assert.deepEqual(result.allowedChanges[0], changes[0]);
    });

    it("should mark package as disallowed when malware detected", async () => {
      mockIsMalware.mock.mockImplementation(() => true);

      const changes = [
        { name: "malicious-pkg", version: "1.0.0", type: "add" },
      ];
      const result = await auditChanges(changes);

      assert.equal(result.allowedChanges.length, 0);
      assert.equal(result.disallowedChanges.length, 1);
      assert.equal(result.isAllowed, false);
      assert.equal(result.disallowedChanges[0].name, "malicious-pkg");
      assert.equal(result.disallowedChanges[0].version, "1.0.0");
      assert.equal(result.disallowedChanges[0].reason, "malware");
    });

    it("should handle mixed safe and malware packages", async () => {
      mockIsMalware.mock.mockImplementation((name) => {
        return name === "malicious-pkg";
      });

      const changes = [
        { name: "lodash", version: "4.17.21", type: "add" },
        { name: "malicious-pkg", version: "1.0.0", type: "add" },
        { name: "express", version: "4.18.0", type: "add" },
      ];
      const result = await auditChanges(changes);

      assert.equal(result.allowedChanges.length, 2);
      assert.equal(result.disallowedChanges.length, 1);
      assert.equal(result.isAllowed, false);
      assert.equal(result.disallowedChanges[0].name, "malicious-pkg");
    });

    it("should only check malware for add and change types", async () => {
      mockIsMalware.mock.mockImplementation(() => false);

      const changes = [
        { name: "pkg1", version: "1.0.0", type: "add" },
        { name: "pkg2", version: "2.0.0", type: "change" },
        { name: "pkg3", version: "3.0.0", type: "remove" },
      ];
      await auditChanges(changes);

      // Should only check pkg1 and pkg2, not pkg3 (remove type)
      assert.equal(mockIsMalware.mock.calls.length, 2);
    });

    it("should increment totalPackages counter for each package", async () => {
      mockIsMalware.mock.mockImplementation(() => false);

      const statsBefore = getAuditStats();
      const initialCount = statsBefore.totalPackages;

      const changes = [
        { name: "pkg1", version: "1.0.0", type: "add" },
        { name: "pkg2", version: "2.0.0", type: "add" },
        { name: "pkg3", version: "3.0.0", type: "add" },
      ];
      await auditChanges(changes);

      const statsAfter = getAuditStats();
      assert.equal(statsAfter.totalPackages, initialCount + 3);
    });

    it("should increment safePackages counter for safe packages", async () => {
      mockIsMalware.mock.mockImplementation(() => false);

      const statsBefore = getAuditStats();
      const initialCount = statsBefore.safePackages;

      const changes = [
        { name: "lodash", version: "4.17.21", type: "add" },
        { name: "express", version: "4.18.0", type: "add" },
      ];
      await auditChanges(changes);

      const statsAfter = getAuditStats();
      assert.equal(statsAfter.safePackages, initialCount + 2);
    });

    it("should increment malwarePackages counter for malware packages", async () => {
      mockIsMalware.mock.mockImplementation(() => true);

      const statsBefore = getAuditStats();
      const initialCount = statsBefore.malwarePackages;

      const changes = [
        { name: "malicious-1", version: "1.0.0", type: "add" },
        { name: "malicious-2", version: "2.0.0", type: "add" },
      ];
      await auditChanges(changes);

      const statsAfter = getAuditStats();
      assert.equal(statsAfter.malwarePackages, initialCount + 2);
    });

    it("should accumulate stats across multiple auditChanges calls", async () => {
      mockIsMalware.mock.mockImplementation(() => false);

      const statsBefore = getAuditStats();
      const initialCount = statsBefore.totalPackages;

      // First call
      await auditChanges([{ name: "pkg1", version: "1.0.0", type: "add" }]);

      // Second call
      await auditChanges([{ name: "pkg2", version: "2.0.0", type: "add" }]);

      const statsAfter = getAuditStats();
      assert.equal(statsAfter.totalPackages, initialCount + 2);
    });

    it("passes a PEP 440-equivalence comparator to isMalware for the py ecosystem", async () => {
      ecosystem = "py";
      mockIsMalware.mock.mockImplementation(() => false);

      await auditChanges([{ name: "numpy", version: "1.0.0", type: "add" }]);

      assert.equal(mockIsMalware.mock.calls.length, 1);
      const versionsEqual = mockIsMalware.mock.calls[0].arguments[2];
      assert.equal(typeof versionsEqual, "function");
      // malware DB entry "1.0" should be considered equal to requested "1.0.0"
      assert.equal(versionsEqual("1.0", "1.0.0"), true);
      assert.equal(versionsEqual("1.0", "2.0"), false);
    });

    it("passes a strict-equality comparator to isMalware for the js ecosystem", async () => {
      ecosystem = "js";
      mockIsMalware.mock.mockImplementation(() => false);

      await auditChanges([{ name: "lodash", version: "1.0.0", type: "add" }]);

      assert.equal(mockIsMalware.mock.calls.length, 1);
      const versionsEqual = mockIsMalware.mock.calls[0].arguments[2];
      assert.equal(typeof versionsEqual, "function");
      // npm behavior must stay untouched: "1.0" must NOT match "1.0.0"
      assert.equal(versionsEqual("1.0", "1.0.0"), false);
      assert.equal(versionsEqual("1.0.0", "1.0.0"), true);
    });
  });
});
