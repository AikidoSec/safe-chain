import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

describe("npmInterceptor - fail-closed for incomplete package identity", async () => {
  let isMalwarePackageCalls = [];
  let isMalwarePackageThrows = false;
  let customRegistries = [];
  let newlyReleasedPackages = new Set();
  let safePatchedPackages = new Set();
  let skipMinimumPackageAgeSetting = false;

  mock.module("../../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async (packageName, version) => {
        isMalwarePackageCalls.push({ packageName, version });
        if (isMalwarePackageThrows) {
          throw new Error(
            `Cannot perform malware check: incomplete package identity (name: ${packageName}, version: ${version})`
          );
        }
        return false;
      },
    },
  });

  mock.module("../../../config/settings.js", {
    namedExports: {
      LOGGING_SILENT: "silent",
      LOGGING_NORMAL: "normal",
      LOGGING_VERBOSE: "verbose",
      ECOSYSTEM_JS: "js",
      ECOSYSTEM_PY: "py",
      LOG_FILE_FORMAT_JSON: "json",
      LOG_FILE_FORMAT_PLAIN: "plain",
      getLoggingLevel: () => "normal",
      getEcoSystem: () => "js",
      setEcoSystem: () => {},
      getMinimumPackageAgeHours: () => 24,
      getNpmCustomRegistries: () => customRegistries,
      getMinimumPackageAgeExclusions: () => [],
      skipMinimumPackageAge: () => skipMinimumPackageAgeSetting,
      getLogFileFormat: () => "json",
      getLogFileVerbosity: () => "verbose",
      getLogFile: () => undefined,
    },
  });

  mock.module("../../../scanning/newPackagesListCache.js", {
    namedExports: {
      openNewPackagesDatabase: async () => ({
        isNewlyReleasedPackage: (name, version) =>
          newlyReleasedPackages.has(`${name}@${version}`),
      }),
    },
  });

  mock.module("../../../scanning/safePatchesListCache.js", {
    namedExports: {
      openSafePatchesDatabase: async () => ({
        isSafePatch: (name, version) =>
          safePatchedPackages.has(`${name}@${version}`),
      }),
    },
  });

  const { npmInterceptorForUrl } = await import("./npmInterceptor.js");

  beforeEach(() => {
    isMalwarePackageCalls = [];
    isMalwarePackageThrows = false;
    customRegistries = [];
    newlyReleasedPackages = new Set();
    safePatchedPackages = new Set();
    skipMinimumPackageAgeSetting = false;
  });

  describe("renamed artifact bypass - fail closed", () => {
    it("should block npm tarball with renamed artifact (no version parsed)", async () => {
      // This is the core exploit: a tarball URL where the filename doesn't match
      // the expected pattern, so version is undefined
      const url =
        "https://registry.npmjs.org/known-package/-/renamed-artifact.tgz";
      isMalwarePackageThrows = true;

      const interceptor = npmInterceptorForUrl(url);
      assert.ok(interceptor, "Interceptor should be created");

      const result = await interceptor.handleRequest(url);

      // Should block the request (fail closed)
      assert.ok(
        result.blockResponse,
        "Should block request with incomplete package identity"
      );
      assert.equal(
        result.blockResponse.statusCode,
        403,
        "Should return 403 Forbidden"
      );
      assert.match(
        result.blockResponse.message,
        /blocked by safe-chain/i,
        "Should indicate blocked by safe-chain"
      );
    });

    it("should block tarball with mismatched package name in filename", async () => {
      // Tarball filename doesn't start with the package name
      const url =
        "https://registry.npmjs.org/lodash/-/different-name-1.0.0.tgz";
      isMalwarePackageThrows = true;

      const interceptor = npmInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.ok(result.blockResponse, "Should block mismatched filename");
      assert.equal(result.blockResponse.statusCode, 403);
    });

    it("should block scoped package with renamed artifact", async () => {
      const url =
        "https://registry.npmjs.org/@babel/core/-/renamed-file.tgz";
      isMalwarePackageThrows = true;

      const interceptor = npmInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.ok(
        result.blockResponse,
        "Should block scoped package with renamed artifact"
      );
      assert.equal(result.blockResponse.statusCode, 403);
    });

    it("should allow properly formatted tarball URL", async () => {
      // Normal case: filename matches expected pattern
      const url = "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz";
      isMalwarePackageThrows = false;

      const interceptor = npmInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      // Should not block (no blockResponse)
      assert.equal(
        result.blockResponse,
        undefined,
        "Should not block properly formatted URL"
      );
      // Verify isMalwarePackage was called with complete identity
      assert.equal(isMalwarePackageCalls.length, 1);
      assert.equal(isMalwarePackageCalls[0].packageName, "lodash");
      assert.equal(isMalwarePackageCalls[0].version, "4.17.21");
    });

    it("should allow scoped package with proper format", async () => {
      const url = "https://registry.npmjs.org/@babel/core/-/core-7.21.4.tgz";
      isMalwarePackageThrows = false;

      const interceptor = npmInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.equal(result.blockResponse, undefined);
      assert.equal(isMalwarePackageCalls.length, 1);
      assert.equal(isMalwarePackageCalls[0].packageName, "@babel/core");
      assert.equal(isMalwarePackageCalls[0].version, "7.21.4");
    });
  });

  describe("custom registry with port - fail closed", () => {
    it("should match custom registry with port correctly", async () => {
      customRegistries = ["custom-registry.example.com:8443"];
      const url =
        "https://custom-registry.example.com:8443/lodash/-/lodash-4.17.21.tgz";
      isMalwarePackageThrows = false;

      const interceptor = npmInterceptorForUrl(url);
      assert.ok(
        interceptor,
        "Should create interceptor for custom registry with port"
      );

      const result = await interceptor.handleRequest(url);

      // Should process the request (not return undefined interceptor)
      assert.equal(isMalwarePackageCalls.length, 1);
      assert.equal(isMalwarePackageCalls[0].packageName, "lodash");
      assert.equal(isMalwarePackageCalls[0].version, "4.17.21");
    });

    it("should not match registry when port differs", async () => {
      customRegistries = ["custom-registry.example.com:8443"];
      const url =
        "https://custom-registry.example.com:9443/lodash/-/lodash-4.17.21.tgz";

      const interceptor = npmInterceptorForUrl(url);

      // Should not create interceptor for mismatched port
      assert.equal(
        interceptor,
        undefined,
        "Should not match registry with different port"
      );
    });

    it("should match custom registry with path prefix", async () => {
      customRegistries = ["custom-registry.example.com/npm-registry"];
      const url =
        "https://custom-registry.example.com/npm-registry/lodash/-/lodash-4.17.21.tgz";
      isMalwarePackageThrows = false;

      const interceptor = npmInterceptorForUrl(url);
      assert.ok(
        interceptor,
        "Should create interceptor for custom registry with path"
      );

      const result = await interceptor.handleRequest(url);

      assert.equal(isMalwarePackageCalls.length, 1);
      assert.equal(isMalwarePackageCalls[0].packageName, "lodash");
    });

    it("should not match registry when path prefix differs", async () => {
      customRegistries = ["custom-registry.example.com/npm-registry"];
      const url =
        "https://custom-registry.example.com/other-path/lodash/-/lodash-4.17.21.tgz";

      const interceptor = npmInterceptorForUrl(url);

      assert.equal(
        interceptor,
        undefined,
        "Should not match registry with different path"
      );
    });

    it("should match custom registry with both port and path", async () => {
      customRegistries = ["custom-registry.example.com:8443/npm"];
      const url =
        "https://custom-registry.example.com:8443/npm/lodash/-/lodash-4.17.21.tgz";
      isMalwarePackageThrows = false;

      const interceptor = npmInterceptorForUrl(url);
      assert.ok(interceptor, "Should create interceptor for registry with port and path");

      const result = await interceptor.handleRequest(url);

      assert.equal(isMalwarePackageCalls.length, 1);
      assert.equal(isMalwarePackageCalls[0].packageName, "lodash");
    });
  });

  describe("edge cases - fail closed", () => {
    it("should block when tarball has no separator (/-/)", async () => {
      const url = "https://registry.npmjs.org/lodash/lodash-4.17.21.tgz";
      isMalwarePackageThrows = true;

      const interceptor = npmInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      // Parser should return undefined for both name and version
      // which should trigger the fail-closed behavior
      assert.ok(
        result.blockResponse || isMalwarePackageCalls.length === 0,
        "Should fail closed for malformed URL"
      );
    });

    it("should handle URL with query parameters correctly", async () => {
      const url =
        "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz?integrity=sha512-abc123";
      isMalwarePackageThrows = false;

      const interceptor = npmInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      // Should parse correctly despite query params
      assert.equal(result.blockResponse, undefined);
      assert.equal(isMalwarePackageCalls.length, 1);
      assert.equal(isMalwarePackageCalls[0].packageName, "lodash");
      assert.equal(isMalwarePackageCalls[0].version, "4.17.21");
    });

    it("should block when isMalwarePackage throws for any reason", async () => {
      const url = "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz";
      isMalwarePackageThrows = true;

      const interceptor = npmInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.ok(
        result.blockResponse,
        "Should block when isMalwarePackage throws"
      );
      assert.equal(result.blockResponse.statusCode, 403);
    });
  });
});
