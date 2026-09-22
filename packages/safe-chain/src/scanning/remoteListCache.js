import { getRemoteList } from "../api/remoteList.js";

/** @type {Map<string, Promise<any>>} */
const entries = new Map();

/**
 * @template T
 * @param {import("../api/remoteList.js").ListType} listType 
 * @param {(list: any[]) => T} builder
 * @returns {Promise<T>}
 */
export function openCachedList(listType, builder) {
  const existing = entries.get(listType);
  if (existing) {
    return existing;
  }
  
  const promise = getRemoteList(listType)
    .then(builder)
    .catch((/** @type {Error} */ err) => {
      // Remove the promise from the cached entries if it matches.
      // We don't want to keep a rejected promise around.
      if (entries.get(listType) === promise) {
        entries.delete(listType);
      }
      throw err;
    });
  
    entries.set(listType, promise);
    return promise;
}

/**
 * Test-only: drops every cached list so the next openCachedList() call refetches.
 */
export function resetCachedLists() {
  entries.clear();
}
