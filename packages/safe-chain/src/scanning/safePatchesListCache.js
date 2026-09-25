import { buildSafePatchesDatabase } from "./safePatchesDatabaseBuilder.js";
import { openCachedList } from "./remoteListCache.js";
import { ListType } from "../api/remoteList.js";
import { warnOnceAboutUnavailableSafePatchesDatabase } from "./safePatchesDatabaseWarnings.js";

/**
 * @returns {Promise<import("./safePatchesDatabaseBuilder.js").SafePatchesDatabase>}
 */
export function openSafePatchesDatabase() {
  return openCachedList(ListType.SAFE_PATCHES_LIST, buildSafePatchesDatabase).catch((error) => {
    warnOnceAboutUnavailableSafePatchesDatabase(error);
    return {
      isSafePatch: () => false,
    }
  });
}
