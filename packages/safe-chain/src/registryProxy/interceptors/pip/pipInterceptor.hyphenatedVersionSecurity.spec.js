import { describe, it, mock } from "node:test";
import assert from "node:assert";

/**
 * Security regression tests for hyphenated PEP 440 version parsing vulnerability.
 * 
 * Vulnerability: The sdist parser previously treated the final hyphen as the package/version
 * boundary, so `victim-1.0-1.tar.gz` was parsed as package `victim-1.0` with version `1`
 * instead of package `victim` with version `1.0-1`. This allowed malicious packages to
 * bypass malware and minimum-age security checks.
 * 
 * These tests verify that:
 * 1. Hyphenated versions are parsed correctly (package identity is preserved)
 * 2. Malware checks use the correct package name
 * 3. Minimum-age checks use the correct package name and version
 * 4. Metadata filtering correctly identifies and filters hyphenated versions
 */
describe("pipInterceptor - hyphenated version security", async () => {
  let scannedPackages = [];
  let malwarePackages = new Set();
  let newlyReleasedPackages = new Set();

  mock.module("../../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async (packageName, version) => {
        scannedPackages.push({ packageName, version });
        return malwarePackages.has(`${packageName}@${version}`);
      },
    },
  });

  mock.module("../../../scanning/newPackagesListCache.js", {
    namedExports: {
      openNewPackagesDatabase: async () => ({
        isNewlyReleasedPackage: (packageName, version) => {
          return newlyReleasedPackages.has(`${packageName}@${version}`);
        },
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
      getPipCustomRegistries: () => [],
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

  it("should scan correct package name for hyphenated PEP 440 version in sdist", async () => {
    scannedPackages = [];
    malwarePackages.clear();
    
    const url = "https://files.pythonhosted.org/packages/source/v/victim/victim-1.0-1.tar.gz";
    const interceptor = pipInterceptorForUrl(url);
    
    await interceptor.handleRequest(url);
    
    // Verify that malware check was performed with correct package name "victim" and version "1.0-1"
    // NOT with incorrect package name "victim-1.0" and version "1"
    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "victim" && version === "1.0-1"
      ),
      "Should scan package 'victim' with version '1.0-1'"
    );
    
    assert.ok(
      !scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "victim-1.0" && version === "1"
      ),
      "Should NOT scan malformed package 'victim-1.0' with version '1'"
    );
  });

  it("should block malware when hyphenated version is in malware database", async () => {
    scannedPackages = [];
    malwarePackages.clear();
    
    // Mark the correct package identity as malware
    malwarePackages.add("victim@1.0-1");
    
    const url = "https://files.pythonhosted.org/packages/source/v/victim/victim-1.0-1.tar.gz";
    const interceptor = pipInterceptorForUrl(url);
    
    const result = await interceptor.handleRequest(url);
    
    // Verify that the package is blocked
    assert.ok(result.blockResponse, "Should block malicious package");
    assert.equal(result.blockResponse.statusCode, 403);
    assert.equal(
      result.blockResponse.message,
      "Forbidden - blocked by safe-chain"
    );
    
    malwarePackages.clear();
  });

  it("should NOT block when malformed identity is in malware database but correct identity is not", async () => {
    scannedPackages = [];
    malwarePackages.clear();
    
    // Mark the INCORRECT (old buggy) package identity as malware
    // This simulates an attacker trying to bypass detection by using a hyphenated version
    malwarePackages.add("victim-1.0@1");
    
    const url = "https://files.pythonhosted.org/packages/source/v/victim/victim-1.0-1.tar.gz";
    const interceptor = pipInterceptorForUrl(url);
    
    const result = await interceptor.handleRequest(url);
    
    // Verify that the package is NOT blocked (because the correct identity is checked)
    assert.ok(!result.blockResponse, "Should not block when only malformed identity is in malware DB");
    
    // Verify the correct identity was checked
    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "victim" && version === "1.0-1"
      ),
      "Should check correct package identity"
    );
    
    malwarePackages.clear();
  });

  it("should scan correct package name for hyphenated package with hyphenated version", async () => {
    scannedPackages = [];
    malwarePackages.clear();
    
    const url = "https://files.pythonhosted.org/packages/source/f/foo-bar/foo-bar-2.0-1.tar.gz";
    const interceptor = pipInterceptorForUrl(url);
    
    await interceptor.handleRequest(url);
    
    // Verify correct parsing: package "foo-bar" with version "2.0-1"
    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "foo-bar" && version === "2.0-1"
      ),
      "Should scan package 'foo-bar' with version '2.0-1'"
    );
    
    // Verify it's NOT parsed as "foo-bar-2.0" with version "1"
    assert.ok(
      !scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "foo-bar-2.0" && version === "1"
      ),
      "Should NOT scan malformed package 'foo-bar-2.0' with version '1'"
    );
  });

  it("should scan correct package name for hyphenated PEP 440 version in wheel", async () => {
    scannedPackages = [];
    malwarePackages.clear();
    
    const url = "https://files.pythonhosted.org/packages/xx/yy/victim-1.0-1-py3-none-any.whl";
    const interceptor = pipInterceptorForUrl(url);
    
    await interceptor.handleRequest(url);
    
    // Verify correct parsing for wheel format
    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "victim" && version === "1.0-1"
      ),
      "Should scan package 'victim' with version '1.0-1' from wheel"
    );
  });

  it("should handle multiple hyphens in package name with hyphenated version", async () => {
    scannedPackages = [];
    malwarePackages.clear();
    
    const url = "https://files.pythonhosted.org/packages/source/m/my-test-pkg/my-test-pkg-1.2-3.tar.gz";
    const interceptor = pipInterceptorForUrl(url);
    
    await interceptor.handleRequest(url);
    
    // Verify correct parsing: package "my-test-pkg" with version "1.2-3"
    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "my-test-pkg" && version === "1.2-3"
      ),
      "Should scan package 'my-test-pkg' with version '1.2-3'"
    );
  });

  it("should correctly identify newly released packages with hyphenated versions", async () => {
    scannedPackages = [];
    malwarePackages.clear();
    newlyReleasedPackages.clear();
    
    // Mark the correct identity as newly released
    newlyReleasedPackages.add("victim@1.0-1");
    
    const url = "https://files.pythonhosted.org/packages/source/v/victim/victim-1.0-1.tar.gz";
    const interceptor = pipInterceptorForUrl(url);
    
    const result = await interceptor.handleRequest(url);
    
    // With minimum package age enabled (48 hours), newly released packages should be blocked
    assert.ok(result.blockResponse, "Should block newly released package");
    assert.equal(result.blockResponse.statusCode, 403);
    
    newlyReleasedPackages.clear();
  });

  it("should NOT block when malformed identity is marked as newly released", async () => {
    scannedPackages = [];
    malwarePackages.clear();
    newlyReleasedPackages.clear();
    
    // Mark the INCORRECT (old buggy) identity as newly released
    newlyReleasedPackages.add("victim-1.0@1");
    
    const url = "https://files.pythonhosted.org/packages/source/v/victim/victim-1.0-1.tar.gz";
    const interceptor = pipInterceptorForUrl(url);
    
    const result = await interceptor.handleRequest(url);
    
    // Should NOT be blocked because the correct identity is checked
    assert.ok(!result.blockResponse, "Should not block when only malformed identity is marked as new");
    
    newlyReleasedPackages.clear();
  });

  // Metadata filtering tests (using the same mocked modules)
  const { modifyPipInfoResponse } = await import("./modifyPipInfo.js");

  it("should filter hyphenated version from HTML metadata using correct package identity", () => {
    
    const headers = {
      "content-type": "application/vnd.pypi.simple.v1+html",
    };

    const body = Buffer.from(`
      <!doctype html>
      <html>
        <body>
          <a href="https://files.pythonhosted.org/packages/source/v/victim/victim-1.0.0.tar.gz">victim-1.0.0.tar.gz</a>
          <a href="https://files.pythonhosted.org/packages/source/v/victim/victim-1.0-1.tar.gz">victim-1.0-1.tar.gz</a>
        </body>
      </html>
    `);

    // Filter function that marks version "1.0-1" as newly released
    const isNewlyReleased = (packageName, version) => {
      // Should be called with correct package name "victim" and version "1.0-1"
      return packageName === "victim" && version === "1.0-1";
    };

    const modified = modifyPipInfoResponse(
      body,
      headers,
      "https://pypi.org/simple/victim/",
      isNewlyReleased,
      "victim"
    ).toString("utf8");

    // Verify that the hyphenated version is filtered out
    assert.ok(modified.includes("victim-1.0.0.tar.gz"), "Should keep old version");
    assert.ok(!modified.includes("victim-1.0-1.tar.gz"), "Should filter hyphenated version");
  });

  it("should NOT filter hyphenated version when malformed identity is checked", () => {
    
    const headers = {
      "content-type": "application/vnd.pypi.simple.v1+html",
    };

    const body = Buffer.from(`
      <!doctype html>
      <html>
        <body>
          <a href="https://files.pythonhosted.org/packages/source/v/victim/victim-1.0-1.tar.gz">victim-1.0-1.tar.gz</a>
        </body>
      </html>
    `);

    // Filter function that checks for INCORRECT (old buggy) identity
    const isNewlyReleased = (packageName, version) => {
      // This would be the old buggy behavior: checking "victim-1.0" with version "1"
      return packageName === "victim-1.0" && version === "1";
    };

    const modified = modifyPipInfoResponse(
      body,
      headers,
      "https://pypi.org/simple/victim/",
      isNewlyReleased,
      "victim"
    ).toString("utf8");

    // Verify that the version is NOT filtered (because correct identity is used)
    assert.ok(modified.includes("victim-1.0-1.tar.gz"), "Should NOT filter when malformed identity is checked");
  });

  it("should filter hyphenated version from JSON metadata using correct package identity", () => {
    
    const headers = {
      "content-type": "application/vnd.pypi.simple.v1+json",
    };

    const body = Buffer.from(
      JSON.stringify({
        name: "victim",
        files: [
          {
            filename: "victim-1.0.0.tar.gz",
            url: "https://files.pythonhosted.org/packages/source/v/victim/victim-1.0.0.tar.gz",
          },
          {
            filename: "victim-1.0-1.tar.gz",
            url: "https://files.pythonhosted.org/packages/source/v/victim/victim-1.0-1.tar.gz",
          },
        ],
      })
    );

    const isNewlyReleased = (packageName, version) => {
      return packageName === "victim" && version === "1.0-1";
    };

    const modified = JSON.parse(
      modifyPipInfoResponse(
        body,
        headers,
        "https://pypi.org/simple/victim/",
        isNewlyReleased,
        "victim"
      ).toString("utf8")
    );

    assert.equal(modified.files.length, 1, "Should filter one file");
    assert.equal(modified.files[0].filename, "victim-1.0.0.tar.gz", "Should keep old version");
  });

  it("should filter hyphenated version from PyPI JSON API metadata", () => {
    
    const headers = {
      "content-type": "application/json",
    };

    const body = Buffer.from(
      JSON.stringify({
        info: { version: "1.0-1" },
        releases: {
          "1.0.0": [
            {
              filename: "victim-1.0.0.tar.gz",
              upload_time_iso_8601: "2024-01-01T00:00:00.000Z",
            },
          ],
          "1.0-1": [
            {
              filename: "victim-1.0-1.tar.gz",
              upload_time_iso_8601: "2024-01-02T00:00:00.000Z",
            },
          ],
        },
        urls: [
          { filename: "victim-1.0-1.tar.gz" },
        ],
      })
    );

    const isNewlyReleased = (packageName, version) => {
      return packageName === "victim" && version === "1.0-1";
    };

    const modified = JSON.parse(
      modifyPipInfoResponse(
        body,
        headers,
        "https://pypi.org/pypi/victim/json",
        isNewlyReleased,
        "victim"
      ).toString("utf8")
    );

    // Verify that the hyphenated version is removed from releases
    assert.deepEqual(Object.keys(modified.releases), ["1.0.0"], "Should remove hyphenated version from releases");
    assert.equal(modified.info.version, "1.0.0", "Should update info.version to remaining version");
    assert.equal(modified.urls.length, 0, "Should remove hyphenated version from urls");
  });

  it("should handle hyphenated package name with hyphenated version in metadata", () => {
    
    const headers = {
      "content-type": "application/vnd.pypi.simple.v1+html",
    };

    const body = Buffer.from(`
      <a href="https://files.pythonhosted.org/packages/source/f/foo-bar/foo-bar-2.0.0.tar.gz">foo-bar-2.0.0.tar.gz</a>
      <a href="https://files.pythonhosted.org/packages/source/f/foo-bar/foo-bar-2.0-1.tar.gz">foo-bar-2.0-1.tar.gz</a>
    `);

    const isNewlyReleased = (packageName, version) => {
      return packageName === "foo-bar" && version === "2.0-1";
    };

    const modified = modifyPipInfoResponse(
      body,
      headers,
      "https://pypi.org/simple/foo-bar/",
      isNewlyReleased,
      "foo-bar"
    ).toString("utf8");

    assert.ok(modified.includes("foo-bar-2.0.0.tar.gz"), "Should keep old version");
    assert.ok(!modified.includes("foo-bar-2.0-1.tar.gz"), "Should filter hyphenated version");
  });
});
