/**
 * @param {string} url
 * @param {string} registry
 * @returns {{packageName: string | undefined, version: string | undefined}}
 */
export function parsePipPackageFromUrl(url, registry) {
  let packageName, version;

  if (!registry || typeof url !== "string") {
    return { packageName, version };
  }

  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    return { packageName, version };
  }

  const lastSegment = urlObj.pathname.split("/").filter(Boolean).pop();
  if (!lastSegment) {
    return { packageName, version };
  }

  const filename = decodeURIComponent(lastSegment);

  const wheelExtRe = /\.whl(?:\.metadata)?$/;
  if (wheelExtRe.test(filename)) {
    const base = filename.replace(wheelExtRe, "");
    const firstDash = base.indexOf("-");
    if (firstDash > 0) {
      const dist = base.slice(0, firstDash);
      const rest = base.slice(firstDash + 1);
      const secondDash = rest.indexOf("-");
      const rawVersion = secondDash >= 0 ? rest.slice(0, secondDash) : rest;
      packageName = dist;
      version = rawVersion;

      if (version === "latest" || !packageName || !version) {
        return { packageName: undefined, version: undefined };
      }

      return { packageName, version };
    }
  }

  const sdistExtWithMetadataRe = /\.(tar\.gz|zip|tar\.bz2|tar\.xz)(\.metadata)?$/i;
  if (sdistExtWithMetadataRe.test(filename)) {
    const base = filename.replace(sdistExtWithMetadataRe, "");
    const lastDash = base.lastIndexOf("-");
    if (lastDash > 0 && lastDash < base.length - 1) {
      packageName = base.slice(0, lastDash);
      version = base.slice(lastDash + 1);

      if (version === "latest" || !packageName || !version) {
        return { packageName: undefined, version: undefined };
      }

      return { packageName, version };
    }
  }

  return { packageName: undefined, version: undefined };
}
