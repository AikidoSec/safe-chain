import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("resolvePackageVersion", async () => {
  const mockNpmFetchJson = mock.fn();

  mock.module("npm-registry-fetch", {
    namedExports: {
      json: mockNpmFetchJson,
    },
  });

  const { resolvePackageVersion } = await import("./npmApi.js");

  it("should return the version if it is already a fixed version", async () => {
    const result = await resolvePackageVersion("express", "4.17.1");

    assert.strictEqual(result, "4.17.1");
  });

  it("should use 'latest' as default version range when not provided", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "4.18.2",
      },
      versions: {
        "4.18.2": {},
      },
    }));

    const result = await resolvePackageVersion("express");

    assert.strictEqual(result, "4.18.2");
  });

  it("should resolve dist-tag versions", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "4.18.2",
        next: "5.0.0-beta.1",
      },
      versions: {
        "4.18.2": {},
        "5.0.0-beta.1": {},
      },
    }));

    const result = await resolvePackageVersion("express", "next");

    assert.strictEqual(result, "5.0.0-beta.1");
  });

  it("should resolve version ranges using semver", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "4.18.2",
      },
      versions: {
        "4.16.0": {},
        "4.17.0": {},
        "4.17.1": {},
        "4.18.0": {},
        "4.18.2": {},
      },
    }));

    const result = await resolvePackageVersion("express", "^4.17.0");

    assert.strictEqual(result, "4.18.2");
  });

  it("should resolve tilde ranges correctly", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "4.18.2",
      },
      versions: {
        "4.17.0": {},
        "4.17.1": {},
        "4.17.3": {},
        "4.18.0": {},
      },
    }));

    const result = await resolvePackageVersion("express", "~4.17.0");

    assert.strictEqual(result, "4.17.3");
  });

  it("should return null if package info cannot be fetched", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => {
      throw new Error("Package not found");
    });

    const result = await resolvePackageVersion("non-existent-package", "latest");

    assert.strictEqual(result, null);
  });

  it("should return null if no versions match the range", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "1.0.0",
      },
      versions: {
        "1.0.0": {},
        "1.1.0": {},
      },
    }));

    const result = await resolvePackageVersion("express", "^5.0.0");

    assert.strictEqual(result, null);
  });

  it("should return null if dist-tag does not exist", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "4.18.2",
      },
      versions: {
        "4.18.2": {},
      },
    }));

    const result = await resolvePackageVersion("express", "nonexistent-tag");

    assert.strictEqual(result, null);
  });

  it("should return null if package info has no versions property (retracted package)", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      _id: "zenn",
      name: "zenn",
      time: {
        modified: "2021-04-20T16:20:56.084Z",
        created: "2017-07-10T19:48:07.891Z",
        unpublished: {
          time: "2021-04-20T16:20:56.084Z",
          versions: [
            "0.9.0",
            "0.9.1",
            "0.9.2",
            "0.9.3",
            "0.9.4",
            "0.9.5",
            "0.9.6",
            "0.9.8",
            "0.9.9",
            "0.9.10",
            "0.9.11",
            "0.9.12",
            "0.9.13",
            "0.9.14",
          ],
        },
      },
    }));

    const result = await resolvePackageVersion("zenn", "^0.9.0");

    assert.strictEqual(result, null);
  });

  it("should return dist-tag version even if versions property is missing", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "4.18.2",
      },
    }));

    const result = await resolvePackageVersion("express", "latest");

    assert.strictEqual(result, "4.18.2");
  });

  it("should handle scoped packages", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "1.2.3",
      },
      versions: {
        "1.2.3": {},
      },
    }));

    const result = await resolvePackageVersion("@scope/package", "latest");

    assert.strictEqual(result, "1.2.3");
  });

  it("should handle complex version ranges", async () => {
    mockNpmFetchJson.mock.mockImplementationOnce(() => ({
      "dist-tags": {
        latest: "2.5.0",
      },
      versions: {
        "1.0.0": {},
        "2.0.0": {},
        "2.3.0": {},
        "2.4.0": {},
        "2.5.0": {},
        "3.0.0": {},
      },
    }));

    const result = await resolvePackageVersion("express", ">=2.0.0 <3.0.0");

    assert.strictEqual(result, "2.5.0");
  });
});
