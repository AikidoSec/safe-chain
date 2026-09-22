import { buildNewPackagesDatabase } from "./newPackagesDatabaseBuilder.js";
import {
  ECOSYSTEM_PY,
  getEcoSystem,
  getMalwareListBaseUrl,
  getMinimumPackageAgeHours,
  defaultMalwareListBaseUrl,
} from "../config/settings.js";
import { openCachedList } from "./remoteListCache.js";
import { ListType } from "../api/remoteList.js";
import { warnOnceAboutUnavailableDatabase } from "./newPackagesDatabaseWarnings.js";

/**
 * @typedef {import("./newPackagesDatabaseBuilder.js").NewPackagesDatabase} NewPackagesDatabase
 */

/**
 * @returns {Promise<NewPackagesDatabase>}
 */
export function openNewPackagesDatabase() {
  const ecoSystem = getEcoSystem();
  // Mirrors of the malware list base URL only host the long-duration feed (npm.json / pypi.json),
  // not the newer npm_48h.json / pypi_48h.json - using the 48h feed there would break compatibility.
  const isDefaultMalwareList =
    getMalwareListBaseUrl() === defaultMalwareListBaseUrl;
  const useLongDuration =
    !isDefaultMalwareList || getMinimumPackageAgeHours() > 48;

  let listType;
  if (useLongDuration) {
    listType =
      ecoSystem === ECOSYSTEM_PY
        ? ListType.PYPI_NEW_PACKAGES_LIST_7D
        : ListType.NPM_NEW_PACKAGES_LIST_7D;
  } else {
    listType =
      ecoSystem === ECOSYSTEM_PY
        ? ListType.PYPI_NEW_PACKAGES_LIST_2D
        : ListType.NPM_NEW_PACKAGES_LIST_2D;
  }

  return openCachedList(listType, buildNewPackagesDatabase).catch((error) => {
    warnOnceAboutUnavailableDatabase(error);
    return { isNewlyReleasedPackage: () => false };
  });
}
