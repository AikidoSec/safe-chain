import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";

const mockFetch = mock.fn();
let writeWarningCalls = [];
let testHomeDir = "";

mock.module("make-fetch-happen", {
  defaultExport: mockFetch,
});

mock.module("../environment/userInteraction.js", {
  namedExports: {
    ui: {
      writeWarning: (msg) => writeWarningCalls.push(msg),
      writeVerbose: () => {},
    },
  },
});

mock.module("../config/settings.js", {
  namedExports: {
    getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
    getVersion: () => "0.0.0",
  },
});

mock.module("../config/configFile.js", {
  namedExports: {
    getSafeChainDirectory: () => testHomeDir,
  },
});

const { getRemoteList, ListType } = await import("./remoteList.js");

/**
 * @param {number} status
 * @param {any} [data]
 * @param {string} [etag]
 */
function fetchResponse(status, data, etag) {
  return {
    status,
    statusText: `status ${status}`,
    headers: {
      get: (name) => (name.toLowerCase() === "etag" ? etag ?? null : null),
    },
    blob: async () => ({
      arrayBuffer: async () => Buffer.from(JSON.stringify(data)),
    }),
  };
}

describe("remoteList", () => {
  beforeEach(() => {
    writeWarningCalls = [];
    mockFetch.mock.resetCalls();
    testHomeDir = path.join(
      os.tmpdir(),
      `safe-chain-remote-list-${process.pid}-${Date.now()}`
    );
    fs.rmSync(testHomeDir, { recursive: true, force: true });
    fs.mkdirSync(testHomeDir, { recursive: true });
    process.env.HOME = testHomeDir;
  });

  it("fetches and returns the list on a cold cache", async () => {
    mockFetch.mock.mockImplementationOnce(async () =>
      fetchResponse(200, [{ package_name: "foo", version: "1.0.0" }])
    );

    const result = await getRemoteList(ListType.NPM_MALWARE_LIST);

    assert.deepStrictEqual(result, [{ package_name: "foo", version: "1.0.0" }]);
  });

  it("falls back to the local cache when fetch fails", async () => {
    mockFetch.mock.mockImplementationOnce(async () =>
      fetchResponse(200, [{ package_name: "cached-pkg", version: "1.0.0" }])
    );
    await getRemoteList(ListType.NPM_MALWARE_LIST);

    mockFetch.mock.mockImplementationOnce(async () => {
      throw new Error("network error");
    });

    const result = await getRemoteList(ListType.NPM_MALWARE_LIST);

    assert.deepStrictEqual(result, [{ package_name: "cached-pkg", version: "1.0.0" }]);
    assert.strictEqual(writeWarningCalls.length, 1);
    assert.ok(writeWarningCalls[0].includes("Using cached version"));
  });

  it("throws when fetch fails and there is no local cache", async () => {
    mockFetch.mock.mockImplementationOnce(async () => {
      throw new Error("network error");
    });

    await assert.rejects(
      () => getRemoteList(ListType.NPM_MALWARE_LIST),
      /Error fetching/
    );
  });

  it("returns the cached list unchanged when the server reports 304 Not Modified", async () => {
    mockFetch.mock.mockImplementationOnce(async () =>
      fetchResponse(200, [{ package_name: "unchanged-pkg", version: "1.0.0" }])
    );
    await getRemoteList(ListType.NPM_MALWARE_LIST);

    mockFetch.mock.mockImplementationOnce(async () => fetchResponse(304));

    const result = await getRemoteList(ListType.NPM_MALWARE_LIST);

    assert.deepStrictEqual(result, [{ package_name: "unchanged-pkg", version: "1.0.0" }]);
  });

  describe("ETag revalidation", () => {
    function sentIfNoneMatch(callIndex) {
      return mockFetch.mock.calls[callIndex].arguments[1].headers["If-None-Match"];
    }

    it("sends the ETag from the previous response in If-None-Match", async () => {
      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(200, [], '"abc"'));
      await getRemoteList(ListType.NPM_MALWARE_LIST);

      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(304));
      await getRemoteList(ListType.NPM_MALWARE_LIST);

      assert.strictEqual(sentIfNoneMatch(0), undefined);
      assert.strictEqual(sentIfNoneMatch(1), '"abc"');
    });

    it("sends a weak ETag back unchanged", async () => {
      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(200, [], 'W/"abc"'));
      await getRemoteList(ListType.NPM_MALWARE_LIST);

      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(304));
      await getRemoteList(ListType.NPM_MALWARE_LIST);

      assert.strictEqual(sentIfNoneMatch(1), 'W/"abc"');
    });

    it("does not revalidate when the previous response had no ETag", async () => {
      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(200, [], '"abc"'));
      await getRemoteList(ListType.NPM_MALWARE_LIST);
      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(200, []));
      await getRemoteList(ListType.NPM_MALWARE_LIST);

      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(200, []));
      await getRemoteList(ListType.NPM_MALWARE_LIST);

      assert.strictEqual(sentIfNoneMatch(2), undefined);
    });

    it("does not revalidate when the cached list is missing", async () => {
      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(200, [], '"abc"'));
      await getRemoteList(ListType.NPM_MALWARE_LIST);
      fs.rmSync(path.join(testHomeDir, "malwareDatabase_npm.json"));

      mockFetch.mock.mockImplementationOnce(async () => fetchResponse(200, []));
      await getRemoteList(ListType.NPM_MALWARE_LIST);

      assert.strictEqual(sentIfNoneMatch(1), undefined);
    });
  });
});
