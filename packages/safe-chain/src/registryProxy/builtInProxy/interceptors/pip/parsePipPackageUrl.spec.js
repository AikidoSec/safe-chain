import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isPipPackageInfoUrl,
  parsePipMetadataUrl,
  parsePipPackageFromUrl,
} from "./parsePipPackageUrl.js";

describe("parsePipPackageUrl", () => {
  it("parses simple metadata URLs", () => {
    assert.deepEqual(parsePipMetadataUrl("https://pypi.org/simple/requests/"), {
      packageName: "requests",
      type: "simple",
    });
  });

  it("parses json metadata URLs", () => {
    assert.deepEqual(parsePipMetadataUrl("https://pypi.org/pypi/requests/json"), {
      packageName: "requests",
      type: "json",
    });
  });

  it("parses per-version json metadata URLs", () => {
    assert.deepEqual(
      parsePipMetadataUrl("https://pypi.org/pypi/requests/2.28.1/json"),
      { packageName: "requests", type: "json" }
    );
  });

  it("decodes encoded metadata package names", () => {
    assert.deepEqual(
      parsePipMetadataUrl("https://pypi.org/simple/foo-bar%5Fbaz/"),
      {
        packageName: "foo-bar_baz",
        type: "simple",
      }
    );
  });

  it("returns undefined for unrecognized metadata paths", () => {
    assert.deepEqual(
      parsePipMetadataUrl("https://pypi.org/unknown/requests/"),
      {
        packageName: undefined,
        type: undefined,
      }
    );
  });

  it("returns undefined for invalid metadata URLs", () => {
    assert.deepEqual(parsePipMetadataUrl("not a url"), {
      packageName: undefined,
      type: undefined,
    });
  });

  it("recognizes package info URLs", () => {
    assert.equal(
      isPipPackageInfoUrl("https://pypi.org/simple/requests/"),
      true
    );
  });

  it("does not treat artifact URLs as package info URLs", () => {
    assert.equal(
      isPipPackageInfoUrl(
        "https://files.pythonhosted.org/packages/source/r/requests/requests-2.28.1.tar.gz"
      ),
      false
    );
  });

  it("parses wheel artifact URLs", () => {
    assert.deepEqual(
      parsePipPackageFromUrl(
        "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl",
        "files.pythonhosted.org"
      ),
      { packageName: "foo_bar", version: "2.0.0" }
    );
  });

  it("parses sdist artifact URLs", () => {
    assert.deepEqual(
      parsePipPackageFromUrl(
        "https://files.pythonhosted.org/packages/source/r/requests/requests-2.28.1.tar.gz",
        "files.pythonhosted.org"
      ),
      { packageName: "requests", version: "2.28.1" }
    );
  });

  it("returns undefined for non-artifact URLs", () => {
    assert.deepEqual(
      parsePipPackageFromUrl("https://pypi.org/simple/requests/", "pypi.org"),
      { packageName: undefined, version: undefined }
    );
  });
});
