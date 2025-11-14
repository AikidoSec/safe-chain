import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("npmInterceptor", async () => {
  let lastPackage;
  let malwareResponse = false;

  mock.module("../../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async (packageName, version) => {
        lastPackage = { packageName, version };
        return malwareResponse;
      },
    },
  });

  const { npmInterceptorForUrl } = await import("./npmInterceptor.js");

  const parserCases = [
    // Regular packages
    {
      url: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
      expected: { packageName: "lodash", version: "4.17.21" },
    },
    {
      url: "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
      expected: { packageName: "express", version: "4.18.2" },
    },
    // Packages with hyphens in name
    {
      url: "https://registry.npmjs.org/safe-chain-test/-/safe-chain-test-1.0.0.tgz",
      expected: { packageName: "safe-chain-test", version: "1.0.0" },
    },
    {
      url: "https://registry.npmjs.org/web-vitals/-/web-vitals-3.5.0.tgz",
      expected: { packageName: "web-vitals", version: "3.5.0" },
    },
    // Preview/prerelease versions
    {
      url: "https://registry.npmjs.org/safe-chain-test/-/safe-chain-test-0.0.1-security.tgz",
      expected: { packageName: "safe-chain-test", version: "0.0.1-security" },
    },
    {
      url: "https://registry.npmjs.org/lodash/-/lodash-5.0.0-beta.1.tgz",
      expected: { packageName: "lodash", version: "5.0.0-beta.1" },
    },
    {
      url: "https://registry.npmjs.org/react/-/react-18.3.0-canary-abc123.tgz",
      expected: { packageName: "react", version: "18.3.0-canary-abc123" },
    },
    // Scoped packages
    {
      url: "https://registry.npmjs.org/@babel/core/-/core-7.21.4.tgz",
      expected: { packageName: "@babel/core", version: "7.21.4" },
    },
    {
      url: "https://registry.npmjs.org/@types/node/-/node-20.10.5.tgz",
      expected: { packageName: "@types/node", version: "20.10.5" },
    },
    {
      url: "https://registry.npmjs.org/@angular/common/-/common-17.0.8.tgz",
      expected: { packageName: "@angular/common", version: "17.0.8" },
    },
    // Scoped packages with hyphens
    {
      url: "https://registry.npmjs.org/@safe-chain/test-package/-/test-package-2.1.0.tgz",
      expected: { packageName: "@safe-chain/test-package", version: "2.1.0" },
    },
    {
      url: "https://registry.npmjs.org/@aws-sdk/client-s3/-/client-s3-3.465.0.tgz",
      expected: { packageName: "@aws-sdk/client-s3", version: "3.465.0" },
    },
    // Scoped packages with preview versions
    {
      url: "https://registry.npmjs.org/@babel/core/-/core-8.0.0-alpha.1.tgz",
      expected: { packageName: "@babel/core", version: "8.0.0-alpha.1" },
    },
    {
      url: "https://registry.npmjs.org/@safe-chain/security-test/-/security-test-1.0.0-security.tgz",
      expected: {
        packageName: "@safe-chain/security-test",
        version: "1.0.0-security",
      },
    },
    // Yarn registry
    {
      url: "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz",
      expected: { packageName: "lodash", version: "4.17.21" },
    },
    {
      url: "https://registry.yarnpkg.com/@babel/core/-/core-7.21.4.tgz",
      expected: { packageName: "@babel/core", version: "7.21.4" },
    },
    // URL to get package info, not tarball
    {
      url: "https://registry.npmjs.org/lodash",
      expected: { packageName: undefined, version: undefined },
    },
    // Complex version patterns
    {
      url: "https://registry.npmjs.org/package-with-many-hyphens/-/package-with-many-hyphens-1.0.0-rc.1+build.123.tgz",
      expected: {
        packageName: "package-with-many-hyphens",
        version: "1.0.0-rc.1+build.123",
      },
    },
    {
      url: "https://registry.npmjs.org/@scope/package-name-with-hyphens/-/package-name-with-hyphens-2.0.0-beta.2.tgz",
      expected: {
        packageName: "@scope/package-name-with-hyphens",
        version: "2.0.0-beta.2",
      },
    },
  ];

  parserCases.forEach(({ url, expected }, index) => {
    it(`should parse URL ${index + 1}: ${url}`, async () => {
      const interceptor = npmInterceptorForUrl(url);
      assert.ok(
        interceptor,
        "Interceptor should be created for known npm registry"
      );

      await interceptor.handleRequest(url);

      assert.deepEqual(lastPackage, expected);
    });
  });

  it("should not create interceptor for unknown registry", () => {
    const url = "https://example.com/some-package/-/some-package-1.0.0.tgz";

    const interceptor = npmInterceptorForUrl(url);

    assert.equal(
      interceptor,
      undefined,
      "Interceptor should be undefined for unknown registry"
    );
  });

  it("should block malicious package", async () => {
    const url =
      "https://registry.npmjs.org/malicious-package/-/malicious-package-1.0.0.tgz";
    malwareResponse = true;

    const interceptor = npmInterceptorForUrl(url);

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
