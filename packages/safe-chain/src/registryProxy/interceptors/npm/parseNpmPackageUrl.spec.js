import { describe, it } from "node:test";
import assert from "node:assert";
import { parseNpmPackageUrl } from "./parseNpmPackageUrl.js";

describe("parse npm package url", () => {
    it("parses a simple tarball download from url", () => {
        const result = parseNpmPackageUrl("https://registry.npmjs.org/dummy-package/-/dummy-package-1.0.0.tgz", "registry.npmjs.org");

        assert.equal(result.packageName, "dummy-package");
        assert.equal(result.version, "1.0.0");
    });

    it("parses pre-release versions", () => {
        const result = parseNpmPackageUrl("https://registry.npmjs.org/dummy-package/-/dummy-package-1.0.0-pre.1.tgz", "registry.npmjs.org");

        assert.equal(result.packageName, "dummy-package");
        assert.equal(result.version, "1.0.0-pre.1");
    });

    it("parses scoped packages", () => {
        const result = parseNpmPackageUrl("https://registry.npmjs.org/@aikidosec/dummy-package/-/dummy-package-1.0.0-pre.1.tgz", "registry.npmjs.org");

        assert.equal(result.packageName, "@aikidosec/dummy-package");
        assert.equal(result.version, "1.0.0-pre.1");
    });

    it("parses a packages from a custom registry", () => {
        const result = parseNpmPackageUrl("https://example.com/dummy-package/-/dummy-package-1.0.0.tgz", "example.com");

        assert.equal(result.packageName, "dummy-package");
        assert.equal(result.version, "1.0.0");
    });

    it("parses a packages from a custom registry with a path prefix", () => {
        const result = parseNpmPackageUrl("https://example.com/api/dummy-package/-/dummy-package-1.0.0.tgz", "example.com/api");

        assert.equal(result.packageName, "dummy-package");
        assert.equal(result.version, "1.0.0");
    });

    it("parses packages from a url ending with '.'", () => {
        // A trailing dot is a legal fully qualified DNS name:
        // registry.npmjs.org. and registry.npmjs.org resolve to the same host and serve byte-identical tarballs.
        const result = parseNpmPackageUrl("https://registry.npmjs.org./dummy-package/-/dummy-package-1.0.0.tgz", "registry.npmjs.org");

        assert.equal(result.packageName, "dummy-package");
        assert.equal(result.version, "1.0.0");
    });

    it("parses packages when the configured registry has a trailing '.'", () => {
        const result = parseNpmPackageUrl("https://registry.npmjs.org/dummy-package/-/dummy-package-1.0.0.tgz", "registry.npmjs.org.");

        assert.equal(result.packageName, "dummy-package");
        assert.equal(result.version, "1.0.0");
    });

    it("parses packages when the configured registry has a different case", () => {
        const result = parseNpmPackageUrl("https://registry.npmjs.org/dummy-package/-/dummy-package-1.0.0.tgz", "Registry.NpmJS.org");

        assert.equal(result.packageName, "dummy-package");
        assert.equal(result.version, "1.0.0");
    });

    it("parses packages from a url ending with '.' against a registry with a path prefix", () => {
        const result = parseNpmPackageUrl("https://example.com./api/dummy-package/-/dummy-package-1.0.0.tgz", "example.com/api");

        assert.equal(result.packageName, "dummy-package");
        assert.equal(result.version, "1.0.0");
    });
});