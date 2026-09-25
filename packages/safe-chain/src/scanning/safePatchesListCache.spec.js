import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

let list = [];
let openCachedListCalls = [];
let openCachedListShouldReject = false;
let writeWarningCalls = [];

mock.module("./remoteListCache.js", {
  namedExports: {
    openCachedList: (listType, builder) => {
      openCachedListCalls.push({ listType, builder });
      if (openCachedListShouldReject) {
        return Promise.reject(new Error("feed unavailable"));
      }
      return Promise.resolve(builder(list));
    },
  },
});

mock.module("../environment/userInteraction.js", {
  namedExports: {
    ui: {
      writeWarning: (msg) => writeWarningCalls.push(msg),
    },
  },
});

// Mocked so this spec doesn't drag in remoteList.js's own dependency chain
// (settings.js / userInteraction.js / fileLogger.js), which a narrow settings.js
// mock above can't satisfy.
const ListType = {
  SAFE_PATCHES_LIST: "SAFE_PATCHES_LIST",
};
mock.module("../api/remoteList.js", {
  namedExports: { ListType },
});

const { openSafePatchesDatabase } = await import("./safePatchesListCache.js");
const { buildSafePatchesDatabase } = await import(
  "./safePatchesDatabaseBuilder.js"
);
const { resetWarningState } = await import("./safePatchesDatabaseWarnings.js");

describe("safePatchesListCache", () => {
  beforeEach(() => {
    list = [];
    openCachedListCalls = [];
    openCachedListShouldReject = false;
    writeWarningCalls = [];
    resetWarningState();
  });

  it("requests the safe patches list", async () => {
    await openSafePatchesDatabase();

    assert.strictEqual(
      openCachedListCalls[0].listType,
      ListType.SAFE_PATCHES_LIST
    );
  });

  it("builds the list with buildSafePatchesDatabase", async () => {
    await openSafePatchesDatabase();

    assert.strictEqual(openCachedListCalls[0].builder, buildSafePatchesDatabase);
  });

  describe("fail-open behaviour", () => {
    it("returns a database that reports no safe patches when the list cannot be loaded", async () => {
      openCachedListShouldReject = true;

      const db = await openSafePatchesDatabase();

      assert.strictEqual(db.isSafePatch("foo", "1.0.0"), false);
    });

    it("warns only once across repeated failures", async () => {
      openCachedListShouldReject = true;

      await openSafePatchesDatabase();
      await openSafePatchesDatabase();

      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(
        writeWarningCalls[0].includes(
          "Continuing without safe patch exemptions"
        )
      );
    });
  });
});
