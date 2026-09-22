import { createHash } from "crypto";
import { getSafeChainDirectory } from "../config/configFile.js";
import { createReadStream, existsSync } from "fs";
import { writeFile, readFile, rename, rm } from "fs/promises";
import path from "path";
import { ui } from "../environment/userInteraction.js";
import { getMalwareListBaseUrl, getVersion } from "../config/settings.js";
import fetch from "make-fetch-happen";

/**
 * @enum {string}
 */
export const ListType = {
  NPM_MALWARE_LIST: "NPM_MALWARE_LIST",
  PYPI_MALWARE_LIST: "PYPI_MALWARE_LIST",
  NPM_NEW_PACKAGES_LIST_2D: "NPM_NEW_PACKAGES_LIST_2D",
  PYPI_NEW_PACKAGES_LIST_2D: "PYPI_NEW_PACKAGES_LIST_2D",
  NPM_NEW_PACKAGES_LIST_7D: "NPM_NEW_PACKAGES_LIST_7D",
  PYPI_NEW_PACKAGES_LIST_7D: "PYPI_NEW_PACKAGES_LIST_7D",
};

const listMetaData = {
  [ListType.NPM_MALWARE_LIST]: {
    cacheFileName: "malwareDatabase_npm.json",
    urlPath: "malware_predictions.json",
    displayName: "malware database",
  },
  [ListType.PYPI_MALWARE_LIST]: {
    cacheFileName: "malwareDatabase_pypi.json",
    urlPath: "malware_pypi.json",
    displayName: "malware database",
  },
  [ListType.NPM_NEW_PACKAGES_LIST_2D]: {
    cacheFileName: "newPackagesList_npm.json",
    urlPath: "releases/npm_48h.json",
    displayName: "new packages list",
  },
  [ListType.PYPI_NEW_PACKAGES_LIST_2D]: {
    cacheFileName: "newPackagesList_pypi.json",
    urlPath: "releases/pypi_48h.json",
    displayName: "new packages list",
  },
  [ListType.NPM_NEW_PACKAGES_LIST_7D]: {
    cacheFileName: "newPackagesList_npm_7d.json",
    urlPath: "releases/npm.json",
    displayName: "new packages list",
  },
  [ListType.PYPI_NEW_PACKAGES_LIST_7D]: {
    cacheFileName: "newPackagesList_pypi_7d.json",
    urlPath: "releases/pypi.json",
    displayName: "new packages list",
  },
};

/**
 *
 * @param {ListType} listType
 */
export async function getRemoteList(listType) {
  const cacheLocation = getCacheLocation(listType);
  const md5 = await computeMd5(cacheLocation).catch(() => undefined);

  let result;
  try {
    result = await fetchRemoteList(listType, md5);

    if (!result.notModified) {
      const buffer = Buffer.from(await result.data.arrayBuffer());
      await writeFileAtomic(cacheLocation, buffer);
    }
  } catch (err) {
    if (!existsSync(cacheLocation)) {
      throw new Error(`Error fetching ${listType}: ${err}`);
    } else {
      ui.writeWarning(
        `Failed to fetch the latest ${listMetaData[listType].displayName}. Using cached version.`,
      );
    }
  }

  try {
    const data = await readFile(cacheLocation, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    // A previous write may have been interrupted (e.g. the process was killed mid-write),
    // leaving a truncated file behind. existsSync() alone can't tell the difference, so we
    // only find out once we try to parse it. Discard the poison pill so the next call doesn't
    // fail the same way forever.
    await rm(cacheLocation, { force: true });
    throw new Error(`Cached ${listType} was unreadable and has been discarded: ${err}`);
  }
}

/**
 * Writes `data` to `location` atomically, so a process killed mid-write never leaves a
 * truncated file behind for a later reader to trip over.
 * @param {string} location
 * @param {Buffer} data
 */
async function writeFileAtomic(location, data) {
  const tmpLocation = `${location}.${process.pid}.tmp`;
  await writeFile(tmpLocation, data);
  await rename(tmpLocation, location);
}

/**
 * @param {ListType} listType
 */
function getCacheLocation(listType) {
  const safeChainDir = getSafeChainDirectory();
  const fileName = listMetaData[listType].cacheFileName;
  return path.join(safeChainDir, fileName);
}

/**
 * @typedef {object} RemoteListNotModified
 * @property {true} notModified
 *
 * @typedef {object} RemoteListData
 * @property {false} notModified
 * @property {import("node-fetch").Blob} data
 *
 * @param {ListType} listType
 * @param {string|undefined} cachedEtag
 * @returns {Promise<RemoteListNotModified | RemoteListData>}
 */
async function fetchRemoteList(listType, cachedEtag) {
  const baseUrl = getMalwareListBaseUrl();
  const path = listMetaData[listType].urlPath;
  const url = `${baseUrl}/${path}`;

  /** @type {HeadersInit} */
  const headers = {
    Referer: getRefererHeader(),
  };
  if (cachedEtag) {
    headers["If-None-Match"] = `"${cachedEtag}"`;
  }

  const response = await fetch(url, {
    headers,
    retry: {
      retries: 4,
      factor: 2,
      minTimeout: 500,
      randomize: false,
    },
    onRetry: (cause) => {
      ui.writeVerbose(
        "An error occurred while trying to download the malware list",
        cause,
      );
    },
  });

  if (response.status === 304) {
    return { notModified: true };
  }
  if (response.status === 200) {
    const data = await response.blob();
    return {
      notModified: false,
      data,
    };
  }

  throw new Error(`Error fetching ${listType}: ${response.statusText}`);
}

function getRefererHeader() {
  const version = getVersion();
  return `https://safe-chain.${version}.aikido.dev`;
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function computeMd5(filePath) {
  const hash = createHash("md5");
  const stream = createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
    stream.on("error", () => {
      reject();
    });
  });
}
