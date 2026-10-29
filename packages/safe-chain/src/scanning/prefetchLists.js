import { skipMinimumPackageAge } from "../config/settings.js";
import { openMalwareDatabase } from "./malwareDatabase.js";
import { openNewPackagesDatabase } from "./newPackagesListCache.js";
import { openSafePatchesDatabase } from "./safePatchesListCache.js";

/**
 * Starts loading the lists the proxy consults, so their download and parse
 * overlap with the package manager starting up instead of delaying its first
 * tarball request. Requests await the same cached promises. A failed load is
 * dropped from the cache, so the request that needs the list retries it and
 * reports the error itself.
 */
export function prefetchLists() {
  void openSafePatchesDatabase();
  openMalwareDatabase().catch(() => {});
  if (!skipMinimumPackageAge()) {
    void openNewPackagesDatabase();
  }
}
