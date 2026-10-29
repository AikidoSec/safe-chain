import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

let skipMinimumPackageAgeSetting = false;
let malwareResult = Promise.resolve({});
let opened = [];

mock.module("../config/settings.js", {
  namedExports: {
    skipMinimumPackageAge: () => skipMinimumPackageAgeSetting,
  },
});

mock.module("./malwareDatabase.js", {
  namedExports: {
    openMalwareDatabase: () => {
      opened.push("malware");
      return malwareResult;
    },
  },
});

mock.module("./newPackagesListCache.js", {
  namedExports: {
    openNewPackagesDatabase: () => {
      opened.push("newPackages");
      return Promise.resolve({});
    },
  },
});

mock.module("./safePatchesListCache.js", {
  namedExports: {
    openSafePatchesDatabase: () => {
      opened.push("safePatches");
      return Promise.resolve({});
    },
  },
});

const { prefetchLists } = await import("./prefetchLists.js");

describe("prefetchLists", () => {
  beforeEach(() => {
    skipMinimumPackageAgeSetting = false;
    malwareResult = Promise.resolve({});
    opened = [];
  });

  it("starts loading the malware, new packages and safe patches lists", () => {
    prefetchLists();

    assert.deepStrictEqual(opened.sort(), [
      "malware",
      "newPackages",
      "safePatches",
    ]);
  });

  it("skips the new packages list when the minimum age check is disabled", () => {
    skipMinimumPackageAgeSetting = true;

    prefetchLists();

    assert.deepStrictEqual(opened.sort(), ["malware", "safePatches"]);
  });

  it("does not leave an unhandled rejection when the malware list fails to load", async () => {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      malwareResult = Promise.reject(new Error("offline"));

      prefetchLists();
      await new Promise((resolve) => setImmediate(resolve));

      assert.deepStrictEqual(unhandled, []);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
