import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("npmInterceptor minimum package age", async () => {
  let minimumPackageAgeSettings = 48;
  let skipMinimumPackageAgeSetting = false;

  mock.module("../../../config/settings.js", {
    namedExports: {
      getMinimumPackageAgeHours: () => minimumPackageAgeSettings,
      skipMinimumPackageAge: () => skipMinimumPackageAgeSetting,
    },
  });

  mock.module("../../../scanning/audit/index.js", {
    namedExports: {
      isMalwarePackage: async () => {
        return false;
      },
    },
  });
  mock.module("../../../environment/userInteraction.js", {
    namedExports: {
      ui: {
        startProcess: () => {},
        writeError: () => {},
        writeInformation: () => {},
        writeWarning: () => {},
        writeVerbose: () => {},
        writeExitWithoutInstallingMaliciousPackages: () => {},
        emptyLine: () => {},
      },
    },
  });
  const { npmInterceptorForUrl } = await import("./npmInterceptor.js");

  for (const packageInfoUrl of [
    // Basic package metadata
    "https://registry.npmjs.org/lodash",
    "https://registry.npmjs.org/express",
    // Scoped packages
    "https://registry.npmjs.org/@vercel/functions",
    "https://registry.npmjs.org/@babel/core",
    "https://registry.npmjs.org/@types/node",
    // With query parameters
    "https://registry.npmjs.org/lodash?write=true",
    "https://registry.npmjs.org/@babel/core?param=value&other=test",
    // With fragments
    "https://registry.npmjs.org/lodash#readme",
    "https://registry.npmjs.org/@babel/core#installation",
    // Version-specific metadata
    "https://registry.npmjs.org/lodash/4.17.21",
    "https://registry.npmjs.org/lodash/latest",
    "https://registry.npmjs.org/@babel/core/7.21.4",
    // URL-encoded scoped packages
    "https://registry.npmjs.org/@types%2Fnode",
    "https://registry.npmjs.org/@babel%2Fcore",
    // With trailing slashes
    "https://registry.npmjs.org/lodash/",
    "https://registry.npmjs.org/@babel/core/",
  ]) {
    it(`modifyResponse should be true for package info requests: ${packageInfoUrl}`, async () => {
      const interceptor = npmInterceptorForUrl(packageInfoUrl);
      const requestInterceptor = await interceptor.handleRequest(
        packageInfoUrl
      );

      assert.equal(requestInterceptor.modifiesResponse(), true);
    });
  }

  for (const packageUrl of [
    // Regular package tarballs
    "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
    "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
    // Scoped package tarballs
    "https://registry.npmjs.org/@babel/core/-/core-8.0.0-alpha.1.tgz",
    "https://registry.npmjs.org/@types/node/-/node-20.10.5.tgz",
    // Tarballs with query parameters (integrity checks)
    "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz?integrity=sha512-abc123",
    "https://registry.npmjs.org/@babel/core/-/core-7.21.4.tgz?integrity=sha512-def456&cache=false",
    // Tarballs with fragments
    "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz#sha512-abc123",
    "https://registry.npmjs.org/@babel/core/-/core-7.21.4.tgz#hash",
    // Prerelease versions
    "https://registry.npmjs.org/react/-/react-18.3.0-canary-abc123.tgz",
    "https://registry.npmjs.org/lodash/-/lodash-5.0.0-beta.1.tgz",
  ]) {
    it(`modifyResponse should be false for package downloads: ${packageUrl}`, async () => {
      const interceptor = npmInterceptorForUrl(packageUrl);
      const requestInterceptor = await interceptor.handleRequest(packageUrl);

      assert.equal(requestInterceptor.modifiesResponse(), false);
    });
  }

  for (const specialEndpoint of [
    // Security advisory endpoints
    "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    "https://registry.npmjs.org/-/npm/v1/security/audits",
    "https://registry.npmjs.org/-/npm/v1/security/audits/quick",
    // Search endpoints
    "https://registry.npmjs.org/-/v1/search?text=lodash&size=20",
    "https://registry.npmjs.org/-/v1/search?text=react&from=0",
    // Package access/collaboration endpoints
    "https://registry.npmjs.org/-/package/lodash/access",
    "https://registry.npmjs.org/-/package/@babel/core/collaborators",
    "https://registry.npmjs.org/-/package/lodash/dist-tags",
    "https://registry.npmjs.org/-/package/@babel/core/dist-tags/latest",
    // User/organization endpoints
    "https://registry.npmjs.org/-/user/org.couchdb.user:username",
    "https://registry.npmjs.org/-/org/myorg/package",
    // Anonymous metrics
    "https://registry.npmjs.org/-/npm/anon-metrics/v1/",
    // Ping/health check
    "https://registry.npmjs.org/-/ping",
  ]) {
    it(`modifyResponse should be false for special endpoints: ${specialEndpoint}`, async () => {
      const interceptor = npmInterceptorForUrl(specialEndpoint);
      const requestInterceptor = await interceptor.handleRequest(
        specialEndpoint
      );

      assert.equal(requestInterceptor.modifiesResponse(), false);
    });
  }

  it("Should remove packages older than the treshold", async () => {
    minimumPackageAgeSettings = 5;
    const packageUrl = "https://registry.npmjs.org/lodash";

    const modifiedBody = await runModifyNpmInfoRequest(
      packageUrl,
      JSON.stringify({
        name: "lodash",
        ["dist-tags"]: {
          latest: "3.0.0",
        },
        versions: {
          ["1.0.0"]: {},
          ["2.0.0"]: {},
          ["3.0.0"]: {},
        },
        time: {
          created: getDate(-365 * 24),
          modified: getDate(-3),
          ["1.0.0"]: getDate(-7),
          // cutoff-date here
          ["2.0.0"]: getDate(-4),
          ["3.0.0"]: getDate(-3),
        },
      })
    );

    const modifiedJson = JSON.parse(modifiedBody);

    assert.equal(Object.keys(modifiedJson.time).length, 3);
    assert.equal(Object.keys(modifiedJson.versions).length, 1);
    assert.ok(Object.keys(modifiedJson.time).includes("1.0.0"));
    assert.ok(Object.keys(modifiedJson.versions).includes("1.0.0"));
    assert.ok(!Object.keys(modifiedJson.time).includes("2.0.0"));
    assert.ok(!Object.keys(modifiedJson.versions).includes("2.0.0"));
    assert.ok(!Object.keys(modifiedJson.time).includes("3.0.0"));
    assert.ok(!Object.keys(modifiedJson.versions).includes("3.0.0"));
  });

  it("Should set the package to the new latest non-preview release", async () => {
    minimumPackageAgeSettings = 5;
    const packageUrl = "https://registry.npmjs.org/lodash";

    const modifiedBody = await runModifyNpmInfoRequest(
      packageUrl,
      JSON.stringify({
        name: "lodash",
        ["dist-tags"]: {
          latest: "3.0.0",
        },
        versions: {
          ["1.0.0"]: {},
          ["2.0.0"]: {},
          ["3.0.0"]: {},
        },
        time: {
          created: getDate(-365 * 24),
          modified: getDate(-3),
          ["1.0.0"]: getDate(-7),
          ["0.0.1"]: getDate(-8), // package order: this package is older than 1.0.0, it should not be considered latest
          ["2.0.0-alpha"]: getDate(-6), //package is a pre-release, it should not be latest
          // cutoff-date here
          ["2.0.0"]: getDate(-4),
          ["3.0.0"]: getDate(-3),
        },
      })
    );

    const modifiedJson = JSON.parse(modifiedBody);

    assert.equal(modifiedJson["dist-tags"]["latest"], "1.0.0");
  });

  it("Should remove dist-tags if version was removed", async () => {
    minimumPackageAgeSettings = 5;
    const packageUrl = "https://registry.npmjs.org/lodash";

    const modifiedBody = await runModifyNpmInfoRequest(
      packageUrl,
      JSON.stringify({
        name: "lodash",
        ["dist-tags"]: {
          latest: "3.0.0",
          alpha: "2.0.0-alpha",
        },
        versions: {
          ["1.0.0"]: {},
          ["2.0.0"]: {},
          ["3.0.0"]: {},
        },
        time: {
          created: getDate(-365 * 24),
          modified: getDate(-4),
          ["1.0.0"]: getDate(-7),
          // cutoff-date here
          ["2.0.0-alpha"]: getDate(-4),
        },
      })
    );

    const modifiedJson = JSON.parse(modifiedBody);
    console.log(modifiedJson);

    assert.equal(modifiedJson["dist-tags"]["alpha"], undefined);
  });

  it("Should not filter packages when skipMinimumPackageAge is enabled", async () => {
    minimumPackageAgeSettings = 5;
    skipMinimumPackageAgeSetting = true;
    const packageUrl = "https://registry.npmjs.org/lodash";

    const originalBody = JSON.stringify({
      name: "lodash",
      ["dist-tags"]: {
        latest: "3.0.0",
      },
      versions: {
        ["1.0.0"]: {},
        ["2.0.0"]: {},
        ["3.0.0"]: {},
      },
      time: {
        created: getDate(-365 * 24),
        modified: getDate(-3),
        ["1.0.0"]: getDate(-7),
        // cutoff-date here
        ["2.0.0"]: getDate(-4),
        ["3.0.0"]: getDate(-3),
      },
    });

    const modifiedBody = await runModifyNpmInfoRequest(
      packageUrl,
      originalBody
    );

    const modifiedJson = JSON.parse(modifiedBody);

    // All versions should remain unchanged
    assert.equal(Object.keys(modifiedJson.versions).length, 3);
    assert.ok(Object.keys(modifiedJson.versions).includes("1.0.0"));
    assert.ok(Object.keys(modifiedJson.versions).includes("2.0.0"));
    assert.ok(Object.keys(modifiedJson.versions).includes("3.0.0"));

    // Latest should remain unchanged
    assert.equal(modifiedJson["dist-tags"]["latest"], "3.0.0");
  });

  function getDate(plusHours) {
    const date = new Date();
    date.setHours(date.getHours() + plusHours);

    return date;
  }

  /**
   * @param {import("../interceptorBuilder.js").Interceptor} interceptor
   * @param {string} body
   * @returns {Promise<string>}
   */
  async function runModifyNpmInfoRequest(url, body) {
    const interceptor = npmInterceptorForUrl(url);
    const requestHandler = await interceptor.handleRequest(url);

    if (requestHandler.modifiesResponse()) {
      const modifiedBuffer = requestHandler.modifyBody(Buffer.from(body), {
        ["content-type"]: "application/json",
      });
      return modifiedBuffer.toString("utf8");
    }

    return body;
  }
});
