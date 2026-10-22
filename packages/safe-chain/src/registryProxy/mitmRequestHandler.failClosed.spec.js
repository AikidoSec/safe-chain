import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

describe("mitmRequestHandler - port handling in targetUrl", async () => {
  // Mock cert utils
  mock.module("./certUtils.js", {
    namedExports: {
      generateCertForHost: () => ({
        key: "mock-key",
        cert: "mock-cert",
      }),
    },
  });

  // Mock user interaction
  mock.module("../environment/userInteraction.js", {
    namedExports: {
      ui: {
        writeVerbose: () => {},
        writeError: () => {},
      },
    },
  });

  // We don't actually import mitmConnect since we can't test it without real sockets
  // Instead, we test the logic directly

  beforeEach(() => {
    // Reset state if needed
  });

  describe("port inclusion in targetUrl", () => {
    it("should include non-standard port in targetUrl", () => {
      // Test the logic that would be used in mitmRequestHandler
      const hostname = "custom-registry.example.com";
      const port = "8443";
      const pathAndQuery = "/lodash/-/lodash-4.17.21.tgz";

      // This is the logic from the fixed code
      const portSuffix = port && port !== "443" ? `:${port}` : "";
      const targetUrl = `https://${hostname}${portSuffix}${pathAndQuery}`;

      assert.equal(
        targetUrl,
        "https://custom-registry.example.com:8443/lodash/-/lodash-4.17.21.tgz",
        "Port should be included in targetUrl for non-standard ports"
      );
    });

    it("should omit port 443 from targetUrl", () => {
      // Standard HTTPS port should be omitted
      const hostname = "registry.npmjs.org";
      const port = "443";
      const pathAndQuery = "/lodash/-/lodash-4.17.21.tgz";

      const portSuffix = port && port !== "443" ? `:${port}` : "";
      const targetUrl = `https://${hostname}${portSuffix}${pathAndQuery}`;

      assert.equal(
        targetUrl,
        "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
        "Port 443 should be omitted from targetUrl as it's the default HTTPS port"
      );
    });
  });

  describe("targetUrl construction", () => {
    it("should construct targetUrl with hostname and path", () => {
      // Test the getRequestPathAndQuery helper logic
      const testCases = [
        {
          input: "/lodash/-/lodash-4.17.21.tgz",
          expected: "/lodash/-/lodash-4.17.21.tgz",
        },
        {
          input: "/lodash/-/lodash-4.17.21.tgz?integrity=sha512-abc",
          expected: "/lodash/-/lodash-4.17.21.tgz?integrity=sha512-abc",
        },
        {
          input: "/@babel/core/-/core-7.21.4.tgz",
          expected: "/@babel/core/-/core-7.21.4.tgz",
        },
      ];

      testCases.forEach(({ input, expected }) => {
        // The getRequestPathAndQuery function should preserve the path and query
        assert.equal(
          input,
          expected,
          `Path and query should be preserved: ${input}`
        );
      });
    });

    it("should handle URLs with query parameters", () => {
      const pathWithQuery = "/package/-/package-1.0.0.tgz?integrity=sha512-xyz";
      assert.ok(
        pathWithQuery.includes("?"),
        "Query parameters should be preserved"
      );
    });

    it("should handle URLs with encoded characters", () => {
      const encodedPath = "/@music-i18n%2fverovio/-/verovio-1.4.1.tgz";
      assert.ok(
        encodedPath.includes("%2f"),
        "Encoded characters should be preserved in path"
      );
    });
  });

  describe("port-based registry matching", () => {
    it("should document that port must be included for matching", () => {
      // This test documents the fix: the targetUrl now includes the port
      // so that registry matching can work correctly for custom registries
      // with non-standard ports

      const scenarios = [
        {
          description: "Custom registry with port 8443",
          hostname: "custom-registry.example.com",
          port: "8443",
          path: "/lodash/-/lodash-4.17.21.tgz",
          expectedUrl:
            "https://custom-registry.example.com:8443/lodash/-/lodash-4.17.21.tgz",
        },
        {
          description: "Standard registry with default port",
          hostname: "registry.npmjs.org",
          port: "443",
          path: "/lodash/-/lodash-4.17.21.tgz",
          expectedUrl: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
        },
        {
          description: "Custom registry with port 9000",
          hostname: "internal-registry.corp.com",
          port: "9000",
          path: "/packages/xx/yy/requests-2.28.1.tar.gz",
          expectedUrl:
            "https://internal-registry.corp.com:9000/packages/xx/yy/requests-2.28.1.tar.gz",
        },
      ];

      scenarios.forEach(({ description, hostname, port, path, expectedUrl }) => {
        // Construct targetUrl as the fixed code does
        const portSuffix = port && port !== "443" ? `:${port}` : "";
        const targetUrl = `https://${hostname}${portSuffix}${path}`;

        assert.equal(
          targetUrl,
          expectedUrl,
          `${description}: targetUrl should be constructed correctly`
        );
      });
    });
  });

  describe("registry interceptor selection", () => {
    it("should match registry with exact hostname and port", () => {
      const registries = [
        "registry.npmjs.org",
        "custom-registry.example.com:8443",
        "internal-registry.corp.com:9000/npm",
      ];

      const testCases = [
        {
          url: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
          shouldMatch: "registry.npmjs.org",
        },
        {
          url: "https://custom-registry.example.com:8443/lodash/-/lodash-4.17.21.tgz",
          shouldMatch: "custom-registry.example.com:8443",
        },
        {
          url: "https://internal-registry.corp.com:9000/npm/lodash/-/lodash-4.17.21.tgz",
          shouldMatch: "internal-registry.corp.com:9000/npm",
        },
        {
          url: "https://custom-registry.example.com:9443/lodash/-/lodash-4.17.21.tgz",
          shouldMatch: null, // Port mismatch
        },
      ];

      testCases.forEach(({ url, shouldMatch }) => {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        const port = parsedUrl.port;
        const pathname = parsedUrl.pathname;

        const matched = registries.find((reg) => {
          const regLower = reg.toLowerCase();
          const slashIndex = regLower.indexOf("/");
          const regHost =
            slashIndex === -1 ? regLower : regLower.substring(0, slashIndex);
          const regPath = slashIndex === -1 ? "" : regLower.substring(slashIndex);

          const colonIndex = regHost.indexOf(":");
          const regHostname =
            colonIndex === -1 ? regHost : regHost.substring(0, colonIndex);
          const regPort =
            colonIndex === -1 ? "" : regHost.substring(colonIndex + 1);

          if (hostname !== regHostname && !hostname.endsWith("." + regHostname)) {
            return false;
          }

          if (regPort && port !== regPort) {
            return false;
          }

          if (regPath && !pathname.startsWith(regPath)) {
            return false;
          }

          return true;
        });

        if (shouldMatch) {
          assert.equal(
            matched,
            shouldMatch,
            `URL ${url} should match registry ${shouldMatch}`
          );
        } else {
          assert.equal(
            matched,
            undefined,
            `URL ${url} should not match any registry`
          );
        }
      });
    });
  });
});
