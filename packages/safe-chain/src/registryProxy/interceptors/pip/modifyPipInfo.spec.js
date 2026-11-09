import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("modifyPipInfo", async () => {
  const verboseLogs = [];
  const recent = "2024-01-03T12:00:00.123456Z";
  const old = "2024-01-01T12:00:00.123456Z";
  const isFileTooNew = (_name, _version, timestamp) =>
    new Date(timestamp) > new Date("2024-01-02T12:00:00Z");
  mock.module("../../../config/settings.js", {
    namedExports: {
      getMinimumPackageAgeHours: () => 48,
      ECOSYSTEM_PY: "py",
    },
  });

  mock.module("../../../environment/userInteraction.js", {
    namedExports: {
      ui: {
        writeVerbose: (message) => verboseLogs.push(message),
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

  it("filters simple JSON upload times and prunes only versions emptied by filtering", () => {
    const body = Buffer.from(JSON.stringify({
      versions: ["1.0.0", "2.0.0", "3.0.0", "4.0.0", "5.0.0"],
      files: [
        { filename: "requests-1.0.0.tar.gz", "upload-time": old },
        { filename: "requests-1.0.0-py3-none-any.whl", "upload-time": recent },
        { filename: "requests-2.0.0.tar.gz", "upload-time": recent },
        { filename: "requests-2.0.0-py3-none-any.whl", "upload-time": recent },
        { filename: "requests-3.0.0.tar.gz" },
        { filename: "requests-5.0.0.tar.gz", "upload-time": "invalid" },
      ],
    }));
    verboseLogs.length = 0;
    const headers = { "content-type": "application/vnd.pypi.simple.v1+json", etag: "abc" };
    const result = JSON.parse(modifyPipInfoResponse(
      body, headers, "https://pypi.org/simple/requests/", () => false,
      "requests", isFileTooNew
    ).toString());

    assert.deepEqual(result.files.map((file) => file.filename), [
      "requests-1.0.0.tar.gz", "requests-3.0.0.tar.gz", "requests-5.0.0.tar.gz",
    ]);
    assert.deepEqual(result.versions, ["1.0.0", "3.0.0", "4.0.0", "5.0.0"]);
    assert.equal(headers.etag, undefined);
    assert.equal(verboseLogs.length, 2);
    assert.equal(verboseLogs.filter((message) => message.includes("requests@2.0.0")).length, 1);
  });

  it("filters legacy urls by ISO upload time with upload_time fallback", () => {
    const body = Buffer.from(JSON.stringify({ urls: [
      { filename: "requests-2.0.0.tar.gz", upload_time_iso_8601: recent },
      { filename: "requests-2.0.0-py3-none-any.whl", upload_time: recent },
      { filename: "requests-2.0.0.zip", upload_time_iso_8601: old, upload_time: recent },
      { filename: "requests-2.0.0.tar.bz2", upload_time_iso_8601: "invalid" },
      { filename: "requests-2.0.0.tar.xz" },
    ] }));
    const result = JSON.parse(modifyPipInfoResponse(
      body, { "content-type": "application/json" },
      "https://pypi.org/pypi/requests/2.0.0/json", () => false,
      "requests", isFileTooNew
    ).toString());
    assert.deepEqual(result.urls.map((file) => file.filename), [
      "requests-2.0.0.zip", "requests-2.0.0.tar.bz2", "requests-2.0.0.tar.xz",
    ]);
  });

  it("prunes release files, deletes emptied releases and deduplicates logs across urls", () => {
    const body = Buffer.from(JSON.stringify({
      info: { version: "3.0.0" },
      releases: {
        "0.5.0": [],
        "1.0.0": [{ upload_time_iso_8601: old }],
        "2.0.0": [{ upload_time_iso_8601: recent }, { upload_time: old }],
        "3.0.0": [{ upload_time_iso_8601: recent }, { upload_time: recent }],
        "4.0.0rc1": [{ upload_time_iso_8601: old }],
        "5.0.0": [{ upload_time_iso_8601: old }],
      },
      urls: [
        { filename: "requests-3.0.0.tar.gz", upload_time_iso_8601: recent },
        { filename: "requests-5.0.0.tar.gz", upload_time_iso_8601: old },
      ],
    }));
    verboseLogs.length = 0;
    const result = JSON.parse(modifyPipInfoResponse(
      body, { "content-type": "application/json" },
      "https://pypi.org/pypi/requests/json", (_name, version) => version === "5.0.0",
      "requests", isFileTooNew
    ).toString());
    assert.deepEqual(Object.keys(result.releases), ["0.5.0", "1.0.0", "2.0.0", "4.0.0rc1"]);
    assert.deepEqual(result.releases["2.0.0"], [{ upload_time: old }]);
    assert.equal(result.info.version, "2.0.0");
    assert.deepEqual(result.urls, []);
    assert.equal(verboseLogs.length, 3);
    for (const version of ["2.0.0", "3.0.0", "5.0.0"]) {
      assert.equal(verboseLogs.filter((message) => message.includes(`requests@${version}`)).length, 1);
    }
  });

  it("returns the original JSON buffer and caching headers when upload times are not too new", () => {
    const body = Buffer.from(JSON.stringify({
      info: { version: "1.0.0" },
      versions: ["1.0.0", "2.0.0"],
      files: [{ filename: "requests-1.0.0.tar.gz", "upload-time": old }],
      releases: { "1.0.0": [{ upload_time_iso_8601: old }, {}, { upload_time: "invalid" }] },
      urls: [{ filename: "requests-1.0.0.tar.gz", upload_time: old }],
    }));
    const headers = { "content-type": "application/json", etag: "abc", "cache-control": "public" };
    assert.strictEqual(modifyPipInfoResponse(
      body, headers, "https://pypi.org/pypi/requests/json", () => false,
      "requests", isFileTooNew
    ), body);
    assert.equal(headers.etag, "abc");
    assert.equal(headers["cache-control"], "public");
  });

  it("keeps a recent safe patch when the file predicate exempts its version", () => {
    const body = Buffer.from(JSON.stringify({
      files: [{ filename: "requests-2.0.0.tar.gz", "upload-time": recent }],
    }));
    assert.strictEqual(modifyPipInfoResponse(
      body, { "content-type": "application/vnd.pypi.simple.v1+json" },
      "https://pypi.org/simple/requests/", () => false, "requests",
      (name, version, timestamp) => version !== "2.0.0" && isFileTooNew(name, version, timestamp)
    ), body);
  });

  it("does not apply the file predicate to HTML metadata", () => {
    const body = Buffer.from('<a href="requests-2.0.0.tar.gz">requests-2.0.0.tar.gz</a>');
    const predicate = mock.fn(() => true);
    assert.strictEqual(modifyPipInfoResponse(
      body, { "content-type": "text/html" }, "https://pypi.org/simple/requests/",
      () => false, "requests", predicate
    ), body);
    assert.equal(predicate.mock.callCount(), 0);
  });
});
