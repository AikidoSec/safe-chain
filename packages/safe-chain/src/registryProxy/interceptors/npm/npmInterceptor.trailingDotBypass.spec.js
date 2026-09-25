import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

let malwarePackages = new Set();
let customRegistries = [];
let newlyReleasedPackages = new Set();

mock.module("../../../scanning/audit/index.js", {
  namedExports: {
    isMalwarePackage: async (packageName, version) => {
      if (!packageName || !version) return false;
      return malwarePackages.has(`${packageName}@${version}`);
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
    skipMinimumPackageAge: () => false,
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

describe("npmInterceptor trailing-dot / mixed-case host handling", async () => {
  const { npmInterceptorForUrl } = await import("./npmInterceptor.js");

  beforeEach(() => {
    malwarePackages = new Set(["lodash@4.17.21"]);
    customRegistries = [];
    newlyReleasedPackages = new Set(["is-number@7.0.0"]);
  });

  it("blocks known malware over the normal host", async () => {
    const url = "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz";
    const interceptor = npmInterceptorForUrl(url);
    assert.ok(interceptor);
    const result = await interceptor.handleRequest(url);
    assert.ok(result.blockResponse, "malware must be blocked on normal host");
  });

  it("blocks known malware with trailing-dot host", async () => {
    const url = "https://registry.npmjs.org./lodash/-/lodash-4.17.21.tgz";
    const interceptor = npmInterceptorForUrl(url);
    assert.ok(interceptor, "interceptor should still trigger");
    const result = await interceptor.handleRequest(url);
    assert.ok(
      result.blockResponse,
      "malware must be blocked on trailing-dot host"
    );
  });

  it("blocks known malware with uppercase host", async () => {
    const url = "https://REGISTRY.NPMJS.ORG/lodash/-/lodash-4.17.21.tgz";
    const interceptor = npmInterceptorForUrl(url);
    assert.ok(interceptor);
    const result = await interceptor.handleRequest(url);
    assert.ok(result.blockResponse, "malware must be blocked on uppercase host");
  });

  it("blocks scoped malware with trailing-dot host", async () => {
    malwarePackages = new Set(["@babel/core@7.21.4"]);
    const url = "https://registry.npmjs.org./%40babel/core/-/core-7.21.4.tgz";
    const interceptor = npmInterceptorForUrl(url);
    assert.ok(interceptor);
    const result = await interceptor.handleRequest(url);
    assert.ok(result.blockResponse, "scoped malware must be blocked");
  });

  it("blocks min-age package with trailing-dot host", async () => {
    const url = "https://registry.npmjs.org./is-number/-/is-number-7.0.0.tgz";
    const interceptor = npmInterceptorForUrl(url);
    assert.ok(interceptor);
    const result = await interceptor.handleRequest(url);
    assert.ok(
      result.blockResponse,
      "newly-released package must be blocked on trailing-dot host"
    );
  });

  it("blocks malware on a custom registry with trailing-dot host", async () => {
    customRegistries = ["my.registry.internal"];
    const url =
      "https://my.registry.internal./lodash/-/lodash-4.17.21.tgz";
    const interceptor = npmInterceptorForUrl(url);
    assert.ok(interceptor, "custom registry with trailing dot must match");
    const result = await interceptor.handleRequest(url);
    assert.ok(result.blockResponse);
  });
});
