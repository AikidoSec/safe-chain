/**
 * Normalizes a bare host segment so equivalent hosts compare equal:
 * lowercases it and strips a single trailing dot (the DNS FQDN notation).
 * @param {string} host
 * @returns {string}
 */
function normalizeHost(host) {
  const lower = host.toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

/**
 * Normalizes only the host segment of a registry (before its first `/`, if
 * any), leaving any path-prefix portion untouched since paths are
 * case-sensitive.
 * @param {string} registry
 * @returns {string}
 */
function normalizeRegistry(registry) {
  const slashIndex = registry.indexOf("/");
  const host = slashIndex === -1 ? registry : registry.substring(0, slashIndex);
  const rest = slashIndex === -1 ? "" : registry.substring(slashIndex);
  return `${normalizeHost(host)}${rest}`;
}

/**
 * @param {string} url
 * @param {string} registry
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
export function parseNpmPackageUrl(url, registry) {
  let packageName, version;
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    return { packageName, version };
  }

  const pathname = parsedUrl.pathname;

  if (!registry || !pathname.endsWith(".tgz")) {
    return { packageName, version };
  }

  const registryPrefix = `${normalizeRegistry(registry)}/`;
  const hostname = normalizeHost(parsedUrl.hostname);
  const host = parsedUrl.port ? `${hostname}:${parsedUrl.port}` : hostname;
  const urlAfterProtocol = `${host}${pathname}`;
  if (!urlAfterProtocol.startsWith(registryPrefix)) {
    return { packageName, version };
  }

  let afterRegistry = decodeURIComponent(
    urlAfterProtocol.substring(registryPrefix.length)
  );
  while (afterRegistry.startsWith("/")) {
    afterRegistry = afterRegistry.substring(1);
  }

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
