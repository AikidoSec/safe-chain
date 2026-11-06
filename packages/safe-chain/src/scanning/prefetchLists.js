import { skipMinimumPackageAge } from "../config/settings.js";
import { openMalwareDatabase } from "./malwareDatabase.js";
import { openNewPackagesDatabase } from "./newPackagesListCache.js";
import { openSafePatchesDatabase } from "./safePatchesListCache.js";

/**
 * Starts loading the lists the proxy consults so they overlap with the package
 * manager starting up. A failed load is retried by the request that needs it.
 */
export function prefetchLists() {
  void openSafePatchesDatabase();
  openMalwareDatabase().catch(() => {});
  if (!skipMinimumPackageAge()) {
    void openNewPackagesDatabase();
  }
}
