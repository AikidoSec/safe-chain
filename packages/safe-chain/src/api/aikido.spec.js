import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

describe("aikido API", async () => {
  const mockFetch = mock.fn();

  mock.module("make-fetch-happen", {
    defaultExport: mockFetch,
  });

  mock.module("../config/settings.js", {
    namedExports: {
      getEcoSystem: () => "js",
      ECOSYSTEM_JS: "js",
      ECOSYSTEM_PY: "py",
    },
  });

  const { fetchMalwareDatabase, fetchMalwareDatabaseVersion } =
    await import("./aikido.js");

  beforeEach(() => {
    mockFetch.mock.resetCalls();
  });

  describe("fetchMalwareDatabase", () => {
    it("should succeed immediately when fetch succeeds on first try", async () => {
      const malwareData = [
        { package_name: "malicious-pkg", version: "1.0.0", reason: "test" },
      ];
      mockFetch.mock.mockImplementationOnce(() => ({
        ok: true,
        json: async () => malwareData,
        headers: { get: () => '"etag-123"' },
      }));

      const result = await fetchMalwareDatabase();

      assert.strictEqual(mockFetch.mock.calls.length, 1);
      assert.deepStrictEqual(result.malwareDatabase, malwareData);
      assert.strictEqual(result.version, '"etag-123"');
    });

    it("should throw error after exhausting all retries", async () => {
      mockFetch.mock.mockImplementation(() => {
        throw new Error("Network error");
      });

      await assert.rejects(() => fetchMalwareDatabase(), {
        message: "Network error",
      });

      assert.strictEqual(mockFetch.mock.calls.length, 4);
    });

    it("should succeed after failing 3 times and succeeding on 4th attempt", async () => {
      const malwareData = [
        { package_name: "bad-pkg", version: "2.0.0", reason: "malware" },
      ];
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount < 4) {
          throw new Error("Network error");
        }
        return {
          ok: true,
          json: async () => malwareData,
          headers: { get: () => '"etag-456"' },
        };
      });

      const result = await fetchMalwareDatabase();

      assert.strictEqual(mockFetch.mock.calls.length, 4);
      assert.deepStrictEqual(result.malwareDatabase, malwareData);
      assert.strictEqual(result.version, '"etag-456"');
    });
  });

  describe("fetchMalwareDatabaseVersion", () => {
    it("should succeed immediately when fetch succeeds on first try", async () => {
      mockFetch.mock.mockImplementationOnce(() => ({
        ok: true,
        headers: { get: () => '"version-etag"' },
      }));

      const result = await fetchMalwareDatabaseVersion();

      assert.strictEqual(mockFetch.mock.calls.length, 1);
      assert.strictEqual(result, '"version-etag"');
    });

    it("should throw error after exhausting all retries", async () => {
      mockFetch.mock.mockImplementation(() => {
        throw new Error("Connection refused");
      });

      await assert.rejects(() => fetchMalwareDatabaseVersion(), {
        message: "Connection refused",
      });

      assert.strictEqual(mockFetch.mock.calls.length, 4);
    });

    it("should succeed after failing 3 times and succeeding on 4th attempt", async () => {
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount < 4) {
          throw new Error("Timeout");
        }
        return {
          ok: true,
          headers: { get: () => '"final-etag"' },
        };
      });

      const result = await fetchMalwareDatabaseVersion();

      assert.strictEqual(mockFetch.mock.calls.length, 4);
      assert.strictEqual(result, '"final-etag"');
    });
  });
});
