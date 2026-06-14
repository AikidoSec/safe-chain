import { normalizePipPackageName } from "../../../scanning/packageNameVariants.js";

const TEST_PACKAGE_VERSION = "0.0.1";

const TEST_PACKAGES = ["safe-chain-pi-test", "aikido-endpoint-test"];

/**
 * @param {string} packageName
 * @returns {string | undefined} canonical hyphen-form name, or undefined if not a test package
 */
export function getTestPackageCanonicalName(packageName) {
  const normalized = normalizePipPackageName(packageName);
  return TEST_PACKAGES.find(
    (p) => normalizePipPackageName(p) === normalized
  );
}

/**
 * @param {string} canonicalName hyphen-form name, e.g. "safe-chain-pi-test"
 * @returns {{statusCode: number, headers: NodeJS.Dict<string>, body: Buffer}}
 */
export function synthesizePipSimpleResponse(canonicalName) {
  const dist = canonicalName.replace(/-/g, "_");
  const filename = `${dist}-${TEST_PACKAGE_VERSION}-py3-none-any.whl`;
  const url = `https://files.pythonhosted.org/packages/00/00/${filename}`;
  const html = [
    `<!DOCTYPE html><html>`,
    `<head><meta name="pypi:repository-version" content="1.0">`,
    `<title>Links for ${canonicalName}</title></head>`,
    `<body><h1>Links for ${canonicalName}</h1>`,
    `<a href="${url}">${filename}</a><br>`,
    `</body></html>`,
  ].join("");
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html",
      "cache-control": "no-cache, no-store, must-revalidate",
      pragma: "no-cache",
    },
    body: Buffer.from(html),
  };
}
