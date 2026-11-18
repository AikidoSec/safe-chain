import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

describe("pipInterceptor - fail-closed for incomplete package identity", async () => {
  let isMalwarePackageCalls = [];
  let isMalwarePackageThrows = false;
  let customRegistries = [];

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

  mock.module("../../../scanning/newPackagesListCache.js", {
    namedExports: {
      openNewPackagesDatabase: async () => ({
        isNewlyReleasedPackage: () => false,
      }),
    },
  });

  mock.module("../../../scanning/safePatchesListCache.js", {
    namedExports: {
      openSafePatchesDatabase: async () => ({
        isSafePatch: () => false,
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
      getMinimumPackageAgeExclusions: () => [],
      getPipCustomRegistries: () => customRegistries,
      getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
      defaultMalwareListBaseUrl: "https://malware-list.aikido.dev",
      getVersion: () => "0.0.0",
      LOGGING_SILENT: "silent",
      LOGGING_VERBOSE: "verbose",
      LOG_FILE_FORMAT_JSON: "json",
      LOG_FILE_FORMAT_PLAIN: "plain",
      skipMinimumPackageAge: () => false,
      getLogFileFormat: () => "json",
      getLogFileVerbosity: () => "verbose",
      getLogFile: () => undefined,
    },
  });

  const { pipInterceptorForUrl } = await import("./pipInterceptor.js");

  beforeEach(() => {
    isMalwarePackageCalls = [];
    isMalwarePackageThrows = false;
    customRegistries = [];
  });

  describe("missing package name - fail closed", () => {
    it("should block when package name cannot be parsed", async () => {
      // URL that doesn't match expected patterns
      const url = "https://files.pythonhosted.org/packages/xx/yy/invalid.tar.gz";
      isMalwarePackageThrows = false;

      const interceptor = pipInterceptorForUrl(url);
      assert.ok(interceptor, "Interceptor should be created");

      const result = await interceptor.handleRequest(url);

      // Should block when packageName is undefined
      assert.ok(
        result.blockResponse,
        "Should block request with unparseable package name"
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

      // isMalwarePackage should not be called when packageName is missing
      assert.equal(
        isMalwarePackageCalls.length,
        0,
        "Should not call isMalwarePackage with undefined packageName"
      );
    });

    it("should block when filename has 'latest' as version", async () => {
      // 'latest' is not a valid version
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/foobar-latest.tar.gz";

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.ok(
        result.blockResponse,
        "Should block 'latest' version placeholder"
      );
      assert.equal(result.blockResponse.statusCode, 403);
    });

    it("should block wheel file with 'latest' version", async () => {
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/foobar-latest-py3-none-any.whl";

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.ok(result.blockResponse, "Should block wheel with 'latest'");
      assert.equal(result.blockResponse.statusCode, 403);
    });

    it("should allow properly formatted package URL", async () => {
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/requests-2.28.1.tar.gz";
      isMalwarePackageThrows = false;

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      // Should not block
      assert.equal(
        result.blockResponse,
        undefined,
        "Should not block properly formatted URL"
      );

      // Should call isMalwarePackage with complete identity
      assert.ok(
        isMalwarePackageCalls.length > 0,
        "Should call isMalwarePackage"
      );
      assert.ok(
        isMalwarePackageCalls.some((call) => call.packageName === "requests"),
        "Should check 'requests' package"
      );
      assert.ok(
        isMalwarePackageCalls.some((call) => call.version === "2.28.1"),
        "Should check version '2.28.1'"
      );
    });

    it("should allow wheel file with proper format", async () => {
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/requests-2.28.1-py3-none-any.whl";
      isMalwarePackageThrows = false;

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.equal(result.blockResponse, undefined);
      assert.ok(isMalwarePackageCalls.length > 0);
    });
  });

  describe("package name variants - fail closed", () => {
    it("should block if any variant check throws", async () => {
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/foo_bar-1.0.0.tar.gz";
      isMalwarePackageThrows = true;

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      // Should block when isMalwarePackage throws
      assert.ok(
        result.blockResponse,
        "Should block when malware check throws"
      );
      assert.equal(result.blockResponse.statusCode, 403);
    });

    it("should check all package name variants for clean package", async () => {
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/foo_bar-1.0.0.tar.gz";
      isMalwarePackageThrows = false;

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.equal(result.blockResponse, undefined);
      // Should check multiple variants (foo-bar, foo_bar, etc.)
      assert.ok(
        isMalwarePackageCalls.length > 0,
        "Should check package name variants"
      );
    });
  });

  describe("custom registry with port - fail closed", () => {
    it("should match custom pip registry with port correctly", async () => {
      customRegistries = ["custom-pypi.example.com:8443"];
      const url =
        "https://custom-pypi.example.com:8443/packages/xx/yy/requests-2.28.1.tar.gz";
      isMalwarePackageThrows = false;

      const interceptor = pipInterceptorForUrl(url);
      assert.ok(
        interceptor,
        "Should create interceptor for custom registry with port"
      );

      const result = await interceptor.handleRequest(url);

      // Should process the request
      assert.ok(
        isMalwarePackageCalls.length > 0,
        "Should check malware for custom registry"
      );
    });

    it("should not match registry when port differs", async () => {
      customRegistries = ["custom-pypi.example.com:8443"];
      const url =
        "https://custom-pypi.example.com:9443/packages/xx/yy/requests-2.28.1.tar.gz";

      const interceptor = pipInterceptorForUrl(url);

      // Should not create interceptor for mismatched port
      assert.equal(
        interceptor,
        undefined,
        "Should not match registry with different port"
      );
    });

    it("should match custom registry with path prefix", async () => {
      customRegistries = ["custom-pypi.example.com/pypi"];
      const url =
        "https://custom-pypi.example.com/pypi/packages/xx/yy/requests-2.28.1.tar.gz";
      isMalwarePackageThrows = false;

      const interceptor = pipInterceptorForUrl(url);
      assert.ok(
        interceptor,
        "Should create interceptor for custom registry with path"
      );

      const result = await interceptor.handleRequest(url);

      assert.ok(isMalwarePackageCalls.length > 0);
    });

    it("should not match registry when path prefix differs", async () => {
      customRegistries = ["custom-pypi.example.com/pypi"];
      const url =
        "https://custom-pypi.example.com/other-path/packages/xx/yy/requests-2.28.1.tar.gz";

      const interceptor = pipInterceptorForUrl(url);

      assert.equal(
        interceptor,
        undefined,
        "Should not match registry with different path"
      );
    });

    it("should match custom registry with both port and path", async () => {
      customRegistries = ["custom-pypi.example.com:8443/pypi"];
      const url =
        "https://custom-pypi.example.com:8443/pypi/packages/xx/yy/requests-2.28.1.tar.gz";
      isMalwarePackageThrows = false;

      const interceptor = pipInterceptorForUrl(url);
      assert.ok(
        interceptor,
        "Should create interceptor for registry with port and path"
      );

      const result = await interceptor.handleRequest(url);

      assert.ok(isMalwarePackageCalls.length > 0);
    });
  });

  describe("edge cases - fail closed", () => {
    it("should block malformed package filename", async () => {
      // A filename with no dash separator won't parse correctly
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/packagename.tar.gz";

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      // Parser should fail to extract both name and version from a filename with no dash
      // When packageName is undefined, the interceptor blocks the request
      assert.ok(
        result.blockResponse,
        "Should fail closed for malformed filename"
      );
      // Should not call isMalwarePackage when packageName is undefined
      assert.equal(
        isMalwarePackageCalls.length,
        0,
        "Should not call isMalwarePackage with undefined packageName"
      );
    });

    it("should block when filename has no dash separator", async () => {
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/packagename.tar.gz";

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.ok(
        result.blockResponse || isMalwarePackageCalls.length === 0,
        "Should fail closed when no version separator"
      );
    });

    it("should handle metadata URLs correctly", async () => {
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/requests-2.28.1.tar.gz.metadata";
      isMalwarePackageThrows = false;

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      // Should parse correctly
      assert.equal(result.blockResponse, undefined);
      assert.ok(isMalwarePackageCalls.length > 0);
    });

    it("should block when isMalwarePackage throws for any reason", async () => {
      const url =
        "https://files.pythonhosted.org/packages/xx/yy/requests-2.28.1.tar.gz";
      isMalwarePackageThrows = true;

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.ok(
        result.blockResponse,
        "Should block when isMalwarePackage throws"
      );
      assert.equal(result.blockResponse.statusCode, 403);
    });
  });

  describe("metadata URLs - should not block", () => {
    it("should not block simple API requests", async () => {
      const url = "https://pypi.org/simple/requests/";

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      // Metadata URLs should not be blocked
      assert.equal(
        result.blockResponse,
        undefined,
        "Should not block metadata API requests"
      );
    });

    it("should not block JSON API requests", async () => {
      const url = "https://pypi.org/pypi/requests/json";

      const interceptor = pipInterceptorForUrl(url);
      const result = await interceptor.handleRequest(url);

      assert.equal(
        result.blockResponse,
        undefined,
        "Should not block JSON API requests"
      );
    });
  });
});
