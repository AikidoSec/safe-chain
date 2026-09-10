/**
 * Canonicalizes a hostname for comparison purposes.
 * Lowercases the host and strips any trailing dot(s).
 *
 * @param {string} host
 * @returns {string}
 */
export function canonicalizeHost(host) {
  if (!host) {
    return "";
  }

  return host.toLowerCase().replace(/\.+$/, "");
}

/**
 * Canonicalizes a registry identifier that may include a path
 * (e.g. "Registry.NpmJS.org." or "my.registry.com./npm").
 * Only the host segment is canonicalized; the path is preserved.
 *
 * @param {string} registry
 * @returns {string}
 */
export function canonicalizeRegistry(registry) {
  if (!registry) {
    return "";
  }

  const slashIndex = registry.indexOf("/");
  if (slashIndex === -1) {
    return canonicalizeHost(registry);
  }

  const host = registry.substring(0, slashIndex);
  const rest = registry.substring(slashIndex);
  return `${canonicalizeHost(host)}${rest}`;
}
