import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("modifyPipInfo", async () => {
  mock.module("../../../config/settings.js", {
    namedExports: {
      getMinimumPackageAgeHours: () => 48,
      ECOSYSTEM_PY: "py",
    },
  });

  mock.module("../../../environment/userInteraction.js", {
    namedExports: {
      ui: {
        writeVerbose: () => {},
      },
    },
  });

  const {
    modifyPipInfoResponse,
  } = await import("./modifyPipInfo.js");

  it("removes too-young files from simple HTML metadata", () => {
    const headers = {
      "content-type": "application/vnd.pypi.simple.v1+html",
      etag: "abc",
      "cache-control": "public",
      "content-length": "999",
      "transfer-encoding": "chunked",
    };

    const body = Buffer.from(`
      <!doctype html>
      <html>
        <body>
          <a href="https://files.pythonhosted.org/packages/source/r/requests/requests-1.0.0.tar.gz">requests-1.0.0.tar.gz</a>
          <a href="https://files.pythonhosted.org/packages/source/r/requests/requests-2.0.0.tar.gz">requests-2.0.0.tar.gz</a>
        </body>
      </html>
    `);

    const modified = modifyPipInfoResponse(
      body,
      headers,
      "https://pypi.org/simple/requests/",
      (_packageName, version) => version === "2.0.0",
      "requests"
    ).toString("utf8");

    assert.ok(modified.includes("requests-1.0.0.tar.gz"));
    assert.ok(!modified.includes("requests-2.0.0.tar.gz"));
    assert.equal(headers.etag, undefined);
    assert.equal(headers["cache-control"], undefined);
    assert.equal(headers["content-length"], undefined);
    assert.equal(headers["transfer-encoding"], "chunked");
  });

  it("leaves mixed-case transport headers untouched for MITM layer to normalize", () => {
    const headers = {
      "content-type": "application/json",
      ETag: "abc",
      "Content-Length": "999",
      "Last-Modified": "yesterday",
      "Cache-Control": "public, max-age=60",
      "Transfer-Encoding": "chunked",
    };

    const body = Buffer.from(
      JSON.stringify({
        info: { version: "2.0.0" },
        releases: {
          "1.0.0": [{ filename: "requests-1.0.0.tar.gz" }],
          "2.0.0": [{ filename: "requests-2.0.0.tar.gz" }],
        },
      })
    );

    modifyPipInfoResponse(
      body,
      headers,
      "https://pypi.org/pypi/requests/json",
      (_packageName, version) => version === "2.0.0",
      "requests"
    );

    assert.equal(headers.ETag, "abc");
    assert.equal(headers["Last-Modified"], "yesterday");
    assert.equal(headers["Cache-Control"], "public, max-age=60");
    assert.equal(headers["Transfer-Encoding"], "chunked");
    assert.equal(headers["Content-Length"], "999");
    assert.equal(headers["content-length"], undefined);
  });

  it("returns body unchanged when no HTML versions are suppressed", () => {
    const headers = {
      "content-type": "application/vnd.pypi.simple.v1+html",
      etag: "abc",
    };

    const body = Buffer.from(
      `<a href="https://files.pythonhosted.org/packages/source/r/requests/requests-1.0.0.tar.gz">requests-1.0.0.tar.gz</a>`
    );

    const result = modifyPipInfoResponse(
      body,
      headers,
      "https://pypi.org/simple/requests/",
      () => false,
      "requests"
    );

    assert.equal(result, body); // same Buffer reference — no copy made
    assert.equal(headers.etag, "abc"); // headers untouched
  });

  it("matches HTML anchor hrefs using normalised package name (underscore vs hyphen)", () => {
    const headers = { "content-type": "application/vnd.pypi.simple.v1+html" };

    const body = Buffer.from(
      `<a href="https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0.tar.gz">foo_bar-2.0.0.tar.gz</a>` +
      `<a href="https://files.pythonhosted.org/packages/xx/yy/foo_bar-1.0.0.tar.gz">foo_bar-1.0.0.tar.gz</a>`
    );

    const modified = modifyPipInfoResponse(
      body,
      headers,
      "https://pypi.org/simple/foo-bar/",
      (_packageName, version) => version === "2.0.0",
      "foo-bar" // hyphenated name, hrefs use underscore
    ).toString("utf8");

    assert.ok(!modified.includes("foo_bar-2.0.0.tar.gz"));
    assert.ok(modified.includes("foo_bar-1.0.0.tar.gz"));
  });

  it("matches anchor href regex with single quotes and extra attributes", () => {
    const headers = { "content-type": "application/vnd.pypi.simple.v1+html" };

    const body = Buffer.from(`
      <a
        data-requires-python="&gt;=3.9"
        class="pkg"
        href='https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0.tar.gz'
      >
        foo_bar-2.0.0.tar.gz
      </a>
      <a href="https://files.pythonhosted.org/packages/xx/yy/foo_bar-1.0.0.tar.gz">foo_bar-1.0.0.tar.gz</a>
    `);

    const modified = modifyPipInfoResponse(
      body,
      headers,
      "https://pypi.org/simple/foo-bar/",
      (_packageName, version) => version === "2.0.0",
      "foo-bar"
    ).toString("utf8");

    assert.ok(!modified.includes("foo_bar-2.0.0.tar.gz"));
    assert.ok(modified.includes("foo_bar-1.0.0.tar.gz"));
  });

  it("removes too-young files from simple JSON metadata", () => {
    const headers = {
      "content-type": "application/vnd.pypi.simple.v1+json",
    };

    const body = Buffer.from(
      JSON.stringify({
        name: "requests",
        files: [
          {
            filename: "requests-1.0.0.tar.gz",
            url: "https://files.pythonhosted.org/packages/source/r/requests/requests-1.0.0.tar.gz",
          },
          {
            filename: "requests-2.0.0.tar.gz",
            url: "https://files.pythonhosted.org/packages/source/r/requests/requests-2.0.0.tar.gz",
          },
        ],
      })
    );

    const modified = JSON.parse(
      modifyPipInfoResponse(
        body,
        headers,
        "https://pypi.org/simple/requests/",
        (_packageName, version) => version === "2.0.0",
        "requests"
      ).toString("utf8")
    );

    assert.equal(modified.files.length, 1);
    assert.equal(modified.files[0].filename, "requests-1.0.0.tar.gz");
  });

  it("filters simple JSON metadata entries that have only filename (no url)", () => {
    const headers = { "content-type": "application/vnd.pypi.simple.v1+json" };

    const body = Buffer.from(
      JSON.stringify({
        name: "requests",
        files: [
          { filename: "requests-1.0.0.tar.gz" },
          { filename: "requests-2.0.0.tar.gz" },
        ],
      })
    );

    const modified = JSON.parse(
      modifyPipInfoResponse(
        body,
        headers,
        "https://pypi.org/simple/requests/",
        (_packageName, version) => version === "2.0.0",
        "requests"
      ).toString("utf8")
    );

    assert.equal(modified.files.length, 1);
    assert.equal(modified.files[0].filename, "requests-1.0.0.tar.gz");
  });

  it("recalculates JSON API info.version after removing too-young releases", () => {
    const headers = {
      "content-type": "application/json",
    };

    const body = Buffer.from(
      JSON.stringify({
        info: { version: "2.0.0" },
        releases: {
          "1.0.0": [
            {
              filename: "requests-1.0.0.tar.gz",
              upload_time_iso_8601: "2024-01-01T00:00:00.000Z",
            },
          ],
          "2.0.0": [
            {
              filename: "requests-2.0.0.tar.gz",
              upload_time_iso_8601: "2024-01-02T00:00:00.000Z",
            },
          ],
          "3.0.0rc1": [
            {
              filename: "requests-3.0.0rc1.tar.gz",
              upload_time_iso_8601: "2024-01-03T00:00:00.000Z",
            },
          ],
        },
        urls: [
          { filename: "requests-2.0.0.tar.gz" },
        ],
      })
    );

    const modified = JSON.parse(
      modifyPipInfoResponse(
        body,
        headers,
        "https://pypi.org/pypi/requests/json",
        (_packageName, version) =>
          version === "2.0.0" || version === "3.0.0rc1",
        "requests"
      ).toString("utf8")
    );

    assert.deepEqual(Object.keys(modified.releases), ["1.0.0"]);
    assert.equal(modified.info.version, "1.0.0");
    assert.equal(modified.urls.length, 0);
  });

  it("falls back to latest pre-release when all stable versions are removed", () => {
    const headers = { "content-type": "application/json" };

    const body = Buffer.from(
      JSON.stringify({
        info: { version: "2.0.0rc2" },
        releases: {
          "1.0.0rc1": [{ filename: "requests-1.0.0rc1.tar.gz" }],
          "2.0.0rc2": [{ filename: "requests-2.0.0rc2.tar.gz" }],
        },
        urls: [],
      })
    );

    const modified = JSON.parse(
      modifyPipInfoResponse(
        body,
        headers,
        "https://pypi.org/pypi/requests/json",
        (_packageName, version) => version === "2.0.0rc2",
        "requests"
      ).toString("utf8")
    );

    assert.deepEqual(Object.keys(modified.releases), ["1.0.0rc1"]);
    assert.equal(modified.info.version, "1.0.0rc1");
  });
});
