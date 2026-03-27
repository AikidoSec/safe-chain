/**
 * @param {string} url
 * @param {string} registry
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
export function parseNpmPackageUrl(url, registry) {
  let packageName, version;
  const urlWithoutParams = url.split("?")[0].split("#")[0];

  if (!registry || !urlWithoutParams.endsWith(".tgz")) {
    return { packageName, version };
  }

  const registryIndex = urlWithoutParams.indexOf(registry);
  const afterRegistry = decodeURIComponent(urlWithoutParams.substring(
    registryIndex + registry.length + 1
  )); // +1 to skip the slash

  const separatorIndex = afterRegistry.indexOf("/-/");
  if (separatorIndex === -1) {
    return { packageName, version };
  }

  packageName = afterRegistry.substring(0, separatorIndex);
  const filename = afterRegistry.substring(
    separatorIndex + 3,
    afterRegistry.length - 4
  ); // Remove /-/ and .tgz

  // Extract version from filename
  // For scoped packages like @babel/core, the filename is core-7.21.4.tgz
  // For regular packages like lodash, the filename is lodash-4.17.21.tgz
  if (packageName.startsWith("@")) {
    const scopedPackageName = packageName.substring(
      packageName.lastIndexOf("/") + 1
    );
    if (filename.startsWith(scopedPackageName + "-")) {
      version = filename.substring(scopedPackageName.length + 1);
    }
  } else {
    if (filename.startsWith(packageName + "-")) {
      version = filename.substring(packageName.length + 1);
    }
  }

  return { packageName, version };
}
