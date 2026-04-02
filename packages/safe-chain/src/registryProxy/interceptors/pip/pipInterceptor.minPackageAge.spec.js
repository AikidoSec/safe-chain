import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("pipInterceptor minimum package age", async () => {
  let skipMinimumPackageAgeSetting = false;
  let newlyReleasedPackageResponse = false;
  let minimumPackageAgeExclusionsSetting = [];

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

  mock.module("../../../config/settings.js", {
    namedExports: {
      ECOSYSTEM_PY: "py",
      getEcoSystem: () => "py",
      getLoggingLevel: () => "silent",
      getMinimumPackageAgeHours: () => 48,
      getMinimumPackageAgeExclusions: () => minimumPackageAgeExclusionsSetting,
      getPipCustomRegistries: () => [],
      LOGGING_SILENT: "silent",
      LOGGING_VERBOSE: "verbose",
      skipMinimumPackageAge: () => skipMinimumPackageAgeSetting,
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

    minimumPackageAgeExclusionsSetting = [];
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
});
