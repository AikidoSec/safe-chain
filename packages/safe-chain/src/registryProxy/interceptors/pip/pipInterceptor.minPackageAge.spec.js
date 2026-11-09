import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("pipInterceptor minimum package age", async () => {
  let skipMinimumPackageAgeSetting = false;
  let newlyReleasedPackageResponse = false;
  let minimumPackageAgeExclusionsSetting = [];
  let safePatchedPackages = new Set();
  const verboseLogs = [];

  mock.module("../../../environment/userInteraction.js", {
    namedExports: {
      ui: { writeVerbose: (message) => verboseLogs.push(message) },
    },
  });

  mock.module("../../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async () => false,
    },
  });

  mock.module("../../../scanning/newPackagesListCache.js", {
    namedExports: {
      openNewPackagesDatabase: async () => ({
        isNewlyReleasedPackage: (packageName, version) => {
          return newlyReleasedPackageResponse &&
            (packageName === "foo-bar" ||
              packageName === "foo_bar" ||
              packageName === "foo.bar") &&
            version === "2.0.0";
        },
      }),
    },
  });

  mock.module("../../../scanning/safePatchesListCache.js", {
    namedExports: {
      openSafePatchesDatabase: async () => ({
        isSafePatch: (packageName, version) =>
          safePatchedPackages.has(`${packageName}@${version}`),
      }),
    },
  });

  mock.module("../../../config/settings.js", {
    namedExports: {
      ECOSYSTEM_JS: "js",
      ECOSYSTEM_PY: "py",
      getEcoSystem: () => "py",
      getLoggingLevel: () => "silent",
      getMinimumPackageAgeHours: () => 48,
      getMinimumPackageAgeExclusions: () => minimumPackageAgeExclusionsSetting,
      getPipCustomRegistries: () => [],
      getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
      defaultMalwareListBaseUrl: "https://malware-list.aikido.dev",
      getVersion: () => "0.0.0",
      LOGGING_SILENT: "silent",
      LOGGING_VERBOSE: "verbose",
      LOG_FILE_FORMAT_JSON: "json",
      LOG_FILE_FORMAT_PLAIN: "plain",
      skipMinimumPackageAge: () => skipMinimumPackageAgeSetting,
      getLogFileFormat: () => "json",
      getLogFileVerbosity: () => "verbose",
      getLogFile: () => undefined,
    },
  });

  const { pipInterceptorForUrl } = await import("./pipInterceptor.js");

  it("should block newly released package downloads", async () => {
    const url =
      "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl";
    newlyReleasedPackageResponse = true;

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.ok(result.blockResponse);
    assert.equal(result.blockResponse.statusCode, 403);
    assert.equal(
      result.blockResponse.message,
      "Forbidden - blocked by safe-chain direct download minimum package age (foo_bar@2.0.0)"
    );

    newlyReleasedPackageResponse = false;
  });

  it("should modify simple metadata responses to suppress too-young versions", async () => {
    const url = "https://pypi.org/simple/foo-bar/";
    newlyReleasedPackageResponse = true;

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.equal(result.modifiesResponse(), true);

    const modifiedBody = result.modifyBody(
      Buffer.from(`
        <a href="https://files.pythonhosted.org/packages/xx/yy/foo_bar-1.0.0.tar.gz">foo_bar-1.0.0.tar.gz</a>
        <a href="https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0.tar.gz">foo_bar-2.0.0.tar.gz</a>
      `),
      {
        "content-type": "application/vnd.pypi.simple.v1+html",
      }
    ).toString("utf8");

    assert.ok(modifiedBody.includes("foo_bar-1.0.0.tar.gz"));
    assert.ok(!modifiedBody.includes("foo_bar-2.0.0.tar.gz"));

    newlyReleasedPackageResponse = false;
  });

  it("should not block newly released package downloads when skipMinimumPackageAge is enabled", async () => {
    const url =
      "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl";
    newlyReleasedPackageResponse = true;
    skipMinimumPackageAgeSetting = true;

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.equal(result.blockResponse, undefined);

    skipMinimumPackageAgeSetting = false;
    assert.equal(result.checkResponseHeaders(200, {
      "last-modified": new Date().toUTCString(),
    }), undefined);
    newlyReleasedPackageResponse = false;
  });

  it("should not block newly released package downloads when the package is excluded", async () => {
    const url =
      "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl";
    newlyReleasedPackageResponse = true;
    minimumPackageAgeExclusionsSetting = ["foo-bar"];

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.equal(result.blockResponse, undefined);

    assert.equal(result.checkResponseHeaders(200, {
      "last-modified": new Date().toUTCString(),
    }), undefined);
    minimumPackageAgeExclusionsSetting = [];
    newlyReleasedPackageResponse = false;
  });

  it("should not modify metadata responses when the package is excluded", async () => {
    const url = "https://pypi.org/simple/foo-bar/";
    newlyReleasedPackageResponse = true;
    minimumPackageAgeExclusionsSetting = ["foo-bar"];

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.equal(result.modifiesResponse(), false);
    assert.equal(result.checkResponseHeaders(200, {
      "last-modified": new Date().toUTCString(),
    }), undefined);

    minimumPackageAgeExclusionsSetting = [];
    newlyReleasedPackageResponse = false;
  });

  it("strips If-None-Match and If-Modified-Since from metadata requests to prevent 304 cache bypass", async () => {
    const url = "https://pypi.org/simple/foo-bar/";
    newlyReleasedPackageResponse = true;

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    const headers = {
      "if-none-match": '"some-etag"',
      "if-modified-since": "Thu, 01 Jan 2026 00:00:00 GMT",
      accept: "*/*",
    };

    result.modifyRequestHeaders(headers);

    assert.equal(headers["if-none-match"], undefined, "If-None-Match must be stripped");
    assert.equal(headers["if-modified-since"], undefined, "If-Modified-Since must be stripped");
    assert.equal(headers.accept, "*/*", "unrelated headers must be preserved");

    newlyReleasedPackageResponse = false;
  });

  it("should not block a confirmed safe patch package download", async () => {
    const url =
      "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl";
    newlyReleasedPackageResponse = true;
    safePatchedPackages = new Set(["foo_bar@2.0.0"]);

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.equal(result.blockResponse, undefined);

    assert.equal(result.checkResponseHeaders(200, {
      "last-modified": new Date().toUTCString(),
    }), undefined);
    safePatchedPackages = new Set();
    newlyReleasedPackageResponse = false;
  });

  it("should not suppress a confirmed safe patch version from simple metadata responses", async () => {
    const url = "https://pypi.org/simple/foo-bar/";
    newlyReleasedPackageResponse = true;
    safePatchedPackages = new Set(["foo-bar@2.0.0"]);

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.equal(result.modifiesResponse(), true);

    const modifiedBody = result.modifyBody(
      Buffer.from(`
        <a href="https://files.pythonhosted.org/packages/xx/yy/foo_bar-1.0.0.tar.gz">foo_bar-1.0.0.tar.gz</a>
        <a href="https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0.tar.gz">foo_bar-2.0.0.tar.gz</a>
      `),
      {
        "content-type": "application/vnd.pypi.simple.v1+html",
      }
    ).toString("utf8");

    assert.ok(modifiedBody.includes("foo_bar-1.0.0.tar.gz"));
    assert.ok(modifiedBody.includes("foo_bar-2.0.0.tar.gz"));

    safePatchedPackages = new Set();
    newlyReleasedPackageResponse = false;
  });

  it("should not block newly released package downloads when a dot-name package matches a hyphen exclusion", async () => {
    const url =
      "https://files.pythonhosted.org/packages/xx/yy/foo.bar-2.0.0.tar.gz";
    newlyReleasedPackageResponse = true;
    minimumPackageAgeExclusionsSetting = ["foo-bar"];

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.equal(result.blockResponse, undefined);

    minimumPackageAgeExclusionsSetting = [];
    newlyReleasedPackageResponse = false;
  });

  for (const filename of [
    "foo_bar-2.0.0-py3-none-any.whl",
    "foo_bar-2.0.0-py3-none-any.whl.metadata",
    "foo_bar-2.0.0.tar.gz",
  ]) {
    it(`blocks ${filename} with recent Last-Modified when the feed does not list it`, async () => {
      newlyReleasedPackageResponse = false;
      const url = `https://files.pythonhosted.org/packages/xx/yy/${filename}`;
      const interceptor = pipInterceptorForUrl(url);
      const events = [];
      interceptor.on("minimumAgeRequestBlocked", (event) => events.push(event));
      const result = await interceptor.handleRequest(url);

      assert.equal(result.blockResponse, undefined);
      assert.deepEqual(result.checkResponseHeaders(200, {
        "last-modified": new Date().toUTCString(),
      }), {
        statusCode: 403,
        message: "Forbidden - blocked by safe-chain direct download minimum package age (foo_bar@2.0.0)",
      });
      assert.equal(events.length, 1);
      assert.equal(events[0].packageName, "foo_bar");
      assert.equal(events[0].version, "2.0.0");
      assert.equal(events[0].targetUrl, url);
    });
  }

  it("allows artifacts with old Last-Modified", async () => {
    const url = "https://files.pythonhosted.org/packages/foo_bar-2.0.0.tar.gz";
    const result = await pipInterceptorForUrl(url).handleRequest(url);

    assert.equal(result.checkResponseHeaders(200, {
      "last-modified": new Date(Date.now() - 72 * 60 * 60 * 1000).toUTCString(),
    }), undefined);
  });

  for (const lastModified of [undefined, "not a date"]) {
    it(`fails open and logs when Last-Modified is ${lastModified === undefined ? "missing" : "invalid"}`, async () => {
      const url = "https://files.pythonhosted.org/packages/foo_bar-2.0.0.tar.gz";
      const result = await pipInterceptorForUrl(url).handleRequest(url);
      verboseLogs.length = 0;

      assert.equal(result.checkResponseHeaders(200, {
        "last-modified": lastModified,
      }), undefined);
      assert.equal(verboseLogs.length, 1);
      assert.ok(verboseLogs[0].includes("foo_bar@2.0.0"));
      assert.ok(verboseLogs[0].includes(url));
    });
  }

  for (const statusCode of [304, 302, 404, 500]) {
    it(`does not check Last-Modified on status ${statusCode}`, async () => {
      const url = "https://files.pythonhosted.org/packages/foo_bar-2.0.0.tar.gz";
      const result = await pipInterceptorForUrl(url).handleRequest(url);
      verboseLogs.length = 0;

      assert.equal(result.checkResponseHeaders(statusCode, {
        "last-modified": new Date().toUTCString(),
      }), undefined);
      assert.deepEqual(verboseLogs, []);
    });
  }

  for (const url of [
    "https://pypi.org/simple/foo-bar/",
    "https://pypi.org/pypi/foo-bar/json",
  ]) {
    it(`does not apply artifact header checks to metadata at ${url}`, async () => {
      const result = await pipInterceptorForUrl(url).handleRequest(url);

      assert.equal(result.checkResponseHeaders(200, {
        "last-modified": new Date().toUTCString(),
      }), undefined);
    });
  }
});
