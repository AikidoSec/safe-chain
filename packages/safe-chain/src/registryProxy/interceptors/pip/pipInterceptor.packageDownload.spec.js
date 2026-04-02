import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("pipInterceptor", async () => {
  let scannedPackages;
  let malwareResponse = false;

  mock.module("../../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async (packageName, version) => {
        scannedPackages.push({ packageName, version });
        return malwareResponse;
      },
    },
  });

  mock.module("../../../scanning/newPackagesListCache.js", {
    namedExports: {
      openNewPackagesDatabase: async () => ({
        isNewlyReleasedPackage: () => false,
      }),
    },
  });

  mock.module("../../../config/settings.js", {
    namedExports: {
      ECOSYSTEM_PY: "py",
      getEcoSystem: () => "py",
      getLoggingLevel: () => "silent",
      getMinimumPackageAgeHours: () => 48,
      getMinimumPackageAgeExclusions: () => [],
      getPipCustomRegistries: () => [],
      LOGGING_SILENT: "silent",
      LOGGING_VERBOSE: "verbose",
      skipMinimumPackageAge: () => false,
    },
  });

  const { pipInterceptorForUrl } = await import("./pipInterceptor.js");

  const parserCases = [
    {
      url: "https://files.pythonhosted.org/packages/xx/yy/foobar-1.2.3.tar.gz",
      expected: { packageName: "foobar", version: "1.2.3" },
    },
    {
      url: "https://pypi.org/packages/source/f/foobar/foobar-1.2.3.tar.gz",
      expected: { packageName: "foobar", version: "1.2.3" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo-bar/foo-bar-0.9.0.tar.gz",
      expected: { packageName: "foo-bar", version: "0.9.0" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0-py3-none-any.whl",
      expected: { packageName: "foo-bar", version: "2.0.0" },
    },
    {
      url: "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl.metadata",
      expected: { packageName: "foo-bar", version: "2.0.0" },
    },
    {
      url: "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl",
      expected: { packageName: "foo-bar", version: "2.0.0" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo.bar/foo.bar-1.0.0.tar.gz",
      expected: { packageName: "foo.bar", version: "1.0.0" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0b1.tar.gz",
      expected: { packageName: "foo-bar", version: "2.0.0b1" },
    },
    {
      url: "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0.tar.gz.metadata",
      expected: { packageName: "foo-bar", version: "2.0.0" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0rc1.tar.gz",
      expected: { packageName: "foo-bar", version: "2.0.0rc1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0.post1.tar.gz",
      expected: { packageName: "foo-bar", version: "2.0.0.post1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0.dev1.tar.gz",
      expected: { packageName: "foo-bar", version: "2.0.0.dev1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0a1.tar.gz",
      expected: { packageName: "foo-bar", version: "2.0.0a1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0-cp38-cp38-manylinux1_x86_64.whl",
      expected: { packageName: "foo-bar", version: "2.0.0" },
    },
    {
      url: "https://pypi.org/simple/",
      expected: { packageName: undefined, version: undefined },
    },
    {
      url: "https://pypi.org/project/foobar/",
      expected: { packageName: undefined, version: undefined },
    },
    {
      url: "https://files.pythonhosted.org/packages/xx/yy/foobar-latest.tar.gz",
      expected: { packageName: undefined, version: undefined },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-latest.tar.gz",
      expected: { packageName: undefined, version: undefined },
    },
  ];

  parserCases.forEach(({ url, expected }, index) => {
    it(`should parse URL ${index + 1}: ${url}`, async () => {
      scannedPackages = [];
      const interceptor = pipInterceptorForUrl(url);
      assert.ok(interceptor, "Interceptor should be created for known pip registry");

      await interceptor.handleRequest(url);

      if (expected.packageName === undefined) {
        assert.deepEqual(scannedPackages, []);
        return;
      }

      assert.ok(
        scannedPackages.some(
          ({ packageName, version }) =>
            packageName === expected.packageName &&
            version === expected.version
        )
      );
    });
  });

  it("should not create interceptor for unknown registry", () => {
    const url = "https://example.com/packages/xx/yy/foobar-1.2.3.tar.gz";
    const interceptor = pipInterceptorForUrl(url);
    assert.equal(interceptor, undefined);
  });

  it("should block malicious package", async () => {
    scannedPackages = [];
    const url =
      "https://files.pythonhosted.org/packages/xx/yy/malicious_package-1.0.0.tar.gz";
    malwareResponse = true;

    const interceptor = pipInterceptorForUrl(url);
    const result = await interceptor.handleRequest(url);

    assert.ok(result.blockResponse);
    assert.equal(result.blockResponse.statusCode, 403);
    assert.equal(
      result.blockResponse.message,
      "Forbidden - blocked by safe-chain"
    );

    malwareResponse = false;
  });
});
