import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("pipInterceptor custom registries", async () => {
  let lastPackage;
  let malwareResponse = false;
  let customRegistries = [];

  mock.module("../../config/settings.js", {
    namedExports: {
      getPipCustomRegistries: () => customRegistries,
    },
  });

  mock.module("../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async (packageName, version) => {
        lastPackage = { packageName, version };
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

    assert.ok(
      interceptor,
      "Interceptor should be created for custom registry"
    );
  });

  it("should parse package from custom registry URL", async () => {
    customRegistries = ["my-custom-registry.example.com"];
    const url =
      "https://my-custom-registry.example.com/packages/xx/yy/foobar-1.2.3.tar.gz";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor, "Interceptor should be created");

    await interceptor.handleRequest(url);

    assert.deepEqual(lastPackage, {
      packageName: "foobar",
      version: "1.2.3",
    });
  });

  it("should parse wheel package from custom registry URL", async () => {
    customRegistries = ["private-pypi.internal.com"];
    const url =
      "https://private-pypi.internal.com/packages/foo_bar-2.0.0-py3-none-any.whl";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor, "Interceptor should be created");

    await interceptor.handleRequest(url);

    assert.deepEqual(lastPackage, {
      packageName: "foo-bar",
      version: "2.0.0",
    });
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

    assert.ok(interceptor1, "Interceptor should be created for first registry");
    assert.ok(
      interceptor2,
      "Interceptor should be created for second registry"
    );
  });

  it("should block malicious package from custom registry", async () => {
    customRegistries = ["my-custom-registry.example.com"];
    malwareResponse = true;

    const url =
      "https://my-custom-registry.example.com/packages/malicious_package-1.0.0.tar.gz";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor, "Interceptor should be created");

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

    malwareResponse = false;
  });

  it("should still work with known registries when custom registries are set", async () => {
    customRegistries = ["my-custom-registry.example.com"];

    const url =
      "https://files.pythonhosted.org/packages/xx/yy/foobar-1.2.3.tar.gz";

    const interceptor = pipInterceptorForUrl(url);

    assert.ok(
      interceptor,
      "Interceptor should be created for known registry even with custom registries set"
    );

    await interceptor.handleRequest(url);

    assert.deepEqual(lastPackage, {
      packageName: "foobar",
      version: "1.2.3",
    });
  });

  it("should not create interceptor for unknown registry when custom registries are set", () => {
    customRegistries = ["my-custom-registry.example.com"];
    const url = "https://unknown-registry.example.com/packages/foobar-1.0.0.tar.gz";

    const interceptor = pipInterceptorForUrl(url);

    assert.equal(
      interceptor,
      undefined,
      "Interceptor should be undefined for unknown registry"
    );
  });

  it("should handle empty custom registries array", () => {
    customRegistries = [];
    const url =
      "https://my-custom-registry.example.com/packages/foobar-1.0.0.tar.gz";

    const interceptor = pipInterceptorForUrl(url);

    assert.equal(
      interceptor,
      undefined,
      "Interceptor should be undefined when no custom registries are configured"
    );
  });

  it("should parse .whl.metadata from custom registry", async () => {
    customRegistries = ["private-pypi.internal.com"];
    const url =
      "https://private-pypi.internal.com/packages/foo_bar-2.0.0-py3-none-any.whl.metadata";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor, "Interceptor should be created");

    await interceptor.handleRequest(url);

    assert.deepEqual(lastPackage, {
      packageName: "foo-bar",
      version: "2.0.0",
    });
  });

  it("should parse .tar.gz.metadata from custom registry", async () => {
    customRegistries = ["private-pypi.internal.com"];
    const url =
      "https://private-pypi.internal.com/packages/foo_bar-2.0.0.tar.gz.metadata";

    const interceptor = pipInterceptorForUrl(url);
    assert.ok(interceptor, "Interceptor should be created");

    await interceptor.handleRequest(url);

    assert.deepEqual(lastPackage, {
      packageName: "foo-bar",
      version: "2.0.0",
    });
  });
});

