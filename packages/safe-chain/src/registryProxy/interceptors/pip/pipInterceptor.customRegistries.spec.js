import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("pipInterceptor custom registries", async () => {
  let scannedPackages;
  let malwareResponse = false;
  let customRegistries = [];

  mock.module("../../../config/settings.js", {
    namedExports: {
      ECOSYSTEM_PY: "py",
      getEcoSystem: () => "py",
      getLoggingLevel: () => "silent",
      getMinimumPackageAgeHours: () => 48,
      getMinimumPackageAgeExclusions: () => [],
      getPipCustomRegistries: () => customRegistries,
      LOGGING_SILENT: "silent",
      LOGGING_VERBOSE: "verbose",
      skipMinimumPackageAge: () => false,
    },
  });

  mock.module("../../../scanning/newPackagesListCache.js", {
    namedExports: {
      openNewPackagesDatabase: async () => ({
        isNewlyReleasedPackage: () => false,
      }),
    },
  });

  mock.module("../../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async (packageName, version) => {
        scannedPackages.push({ packageName, version });
        return malwareResponse;
      },
    },
  });

  const { pipInterceptorForUrl } = await import("./pipInterceptor.js");

  it("should create interceptor for custom registry", () => {
    customRegistries = ["my-custom-registry.example.com"];
    const url =
      "https://my-custom-registry.example.com/packages/xx/yy/foobar-1.2.3.tar.gz";

    const interceptor = pipInterceptorForUrl(url);

    assert.ok(interceptor);
  });

  it("should parse package from custom registry URL", async () => {
    scannedPackages = [];
    customRegistries = ["my-custom-registry.example.com"];
    const url =
      "https://my-custom-registry.example.com/packages/xx/yy/foobar-1.2.3.tar.gz";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor);

    await interceptor.handleRequest(url);

    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "foobar" && version === "1.2.3"
      )
    );
  });

  it("should parse wheel package from custom registry URL", async () => {
    scannedPackages = [];
    customRegistries = ["private-pypi.internal.com"];
    const url =
      "https://private-pypi.internal.com/packages/foo_bar-2.0.0-py3-none-any.whl";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor);

    await interceptor.handleRequest(url);

    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "foo-bar" && version === "2.0.0"
      )
    );
  });

  it("should handle multiple custom registries", async () => {
    customRegistries = [
      "registry-one.example.com",
      "registry-two.example.com",
    ];

    const url1 =
      "https://registry-one.example.com/packages/package1-1.0.0.tar.gz";
    const url2 =
      "https://registry-two.example.com/packages/package2-2.0.0.tar.gz";

    const interceptor1 = pipInterceptorForUrl(url1);
    const interceptor2 = pipInterceptorForUrl(url2);

    assert.ok(interceptor1);
    assert.ok(interceptor2);
  });

  it("should block malicious package from custom registry", async () => {
    scannedPackages = [];
    customRegistries = ["my-custom-registry.example.com"];
    malwareResponse = true;

    const url =
      "https://my-custom-registry.example.com/packages/malicious_package-1.0.0.tar.gz";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor);

    const result = await interceptor.handleRequest(url);

    assert.ok(result.blockResponse);
    assert.equal(result.blockResponse.statusCode, 403);
    assert.equal(result.blockResponse.message, "Forbidden - blocked by safe-chain");

    malwareResponse = false;
  });

  it("should still work with known registries when custom registries are set", async () => {
    scannedPackages = [];
    customRegistries = ["my-custom-registry.example.com"];

    const url =
      "https://files.pythonhosted.org/packages/xx/yy/foobar-1.2.3.tar.gz";

    const interceptor = pipInterceptorForUrl(url);

    assert.ok(interceptor);

    await interceptor.handleRequest(url);

    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "foobar" && version === "1.2.3"
      )
    );
  });

  it("should not create interceptor for unknown registry when custom registries are set", () => {
    customRegistries = ["my-custom-registry.example.com"];
    const url = "https://unknown-registry.example.com/packages/foobar-1.0.0.tar.gz";

    const interceptor = pipInterceptorForUrl(url);

    assert.equal(interceptor, undefined);
  });

  it("should handle empty custom registries array", () => {
    customRegistries = [];
    const url =
      "https://my-custom-registry.example.com/packages/foobar-1.0.0.tar.gz";

    const interceptor = pipInterceptorForUrl(url);

    assert.equal(interceptor, undefined);
  });

  it("should parse .whl.metadata from custom registry", async () => {
    scannedPackages = [];
    customRegistries = ["private-pypi.internal.com"];
    const url =
      "https://private-pypi.internal.com/packages/foo_bar-2.0.0-py3-none-any.whl.metadata";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor);

    await interceptor.handleRequest(url);

    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "foo-bar" && version === "2.0.0"
      )
    );
  });

  it("should parse .tar.gz.metadata from custom registry", async () => {
    scannedPackages = [];
    customRegistries = ["private-pypi.internal.com"];
    const url =
      "https://private-pypi.internal.com/packages/foo_bar-2.0.0.tar.gz.metadata";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor);

    await interceptor.handleRequest(url);

    assert.ok(
      scannedPackages.some(
        ({ packageName, version }) =>
          packageName === "foo-bar" && version === "2.0.0"
      )
    );
  });
});
