import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("pipInterceptor", async () => {
  let lastPackage;
  let malwareResponse = false;

  mock.module("../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async (packageName, version) => {
        lastPackage = { packageName, version };
        return malwareResponse;
      },
    },
  });

  const { pipInterceptorForUrl } = await import("./pipInterceptor.js");

  const parserCases = [
    // Valid pip URLs
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
      expected: { packageName: "foo_bar", version: "2.0.0" },
    },
    {
      url: "https://files.pythonhosted.org/packages/xx/yy/foo_bar-2.0.0-py3-none-any.whl",
      expected: { packageName: "foo_bar", version: "2.0.0" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo.bar/foo.bar-1.0.0.tar.gz",
      expected: { packageName: "foo.bar", version: "1.0.0" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0b1.tar.gz",
      expected: { packageName: "foo_bar", version: "2.0.0b1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0rc1.tar.gz",
      expected: { packageName: "foo_bar", version: "2.0.0rc1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0.post1.tar.gz",
      expected: { packageName: "foo_bar", version: "2.0.0.post1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0.dev1.tar.gz",
      expected: { packageName: "foo_bar", version: "2.0.0.dev1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0a1.tar.gz",
      expected: { packageName: "foo_bar", version: "2.0.0a1" },
    },
    {
      url: "https://pypi.org/packages/source/f/foo_bar/foo_bar-2.0.0-cp38-cp38-manylinux1_x86_64.whl",
      expected: { packageName: "foo_bar", version: "2.0.0" },
    },
    // Invalid pip URLs
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
      const interceptor = pipInterceptorForUrl(url);
      assert.ok(
        interceptor,
        "Interceptor should be created for known npm registry"
      );

      await interceptor.handleRequest(url);

      assert.deepEqual(lastPackage, expected);
    });
  });

  it("should not create interceptor for unknown registry", () => {
    const url = "https://example.com/packages/xx/yy/foobar-1.2.3.tar.gz";

    const interceptor = pipInterceptorForUrl(url);

    assert.equal(
      interceptor,
      undefined,
      "Interceptor should be undefined for unknown registry"
    );
  });

  it("should block malicious package", async () => {
    const url =
      "https://files.pythonhosted.org/packages/xx/yy/malicious_package-1.0.0.tar.gz";
    malwareResponse = true;

    const interceptor = pipInterceptorForUrl(url);

    const result = await interceptor.handleRequest(url);

    assert.ok(result.blockResponse, "Should contain a blockResponse");
    assert.equal(
      result.blockResponse.statusCode,
      403,
      "Block response should have status code 403"
    );
    assert.equal(
      result.blockResponse.message,
      "Forbidden - blocked by safe-chain",
      "Block response should have correct status message"
    );
  });
});
