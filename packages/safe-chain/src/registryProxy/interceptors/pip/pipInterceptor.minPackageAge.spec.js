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
      getMinimumPackageAgeExclusions: () => minimumPackageAgeExclusionsSetting,
      getPipCustomRegistries: () => [],
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
