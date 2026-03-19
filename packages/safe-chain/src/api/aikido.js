import fetch from "make-fetch-happen";
import {
  getEcoSystem,
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
} from "../config/settings.js";
import { ui } from "../environment/userInteraction.js";

const malwareDatabaseUrls = {
  [ECOSYSTEM_JS]: "https://malware-list.aikido.dev/malware_predictions.json",
  [ECOSYSTEM_PY]: "https://malware-list.aikido.dev/malware_pypi.json",
};

// TODO: replace with the real CDN URL once core publishes the S3 endpoint
const newPackagesListUrls = {
  [ECOSYSTEM_JS]: "https://new-packages.aikido.dev/js_packages.json",
};

const DEFAULT_FETCH_RETRY_ATTEMPTS = 4;

/**
 * @typedef {Object} MalwarePackage
 * @property {string} package_name
 * @property {string} version
 * @property {string} reason
 */

/**
 * @typedef {Object} NewPackageEntry
 * @property {string} source
 * @property {string} name
 * @property {string} version
 * @property {number} released_on  - Unix timestamp (seconds)
 * @property {number} scraped_on   - Unix timestamp (seconds)
 */

/**
 * @returns {Promise<{malwareDatabase: MalwarePackage[], version: string | undefined}>}
 */
export async function fetchMalwareDatabase() {
  return retry(async () => {
    const ecosystem = getEcoSystem();
    const malwareDatabaseUrl =
      malwareDatabaseUrls[
        /** @type {keyof typeof malwareDatabaseUrls} */ (ecosystem)
      ];
    const response = await fetch(malwareDatabaseUrl);
    if (!response.ok) {
      throw new Error(
        `Error fetching ${ecosystem} malware database: ${response.statusText}`
      );
    }

    try {
      let malwareDatabase = await response.json();
      return {
        malwareDatabase: malwareDatabase,
        version: response.headers.get("etag") || undefined,
      };
    } catch (/** @type {any} */ error) {
      throw new Error(`Error parsing malware database: ${error.message}`);
    }
  }, DEFAULT_FETCH_RETRY_ATTEMPTS);
}

/**
 * @returns {Promise<string | undefined>}
 */
export async function fetchMalwareDatabaseVersion() {
  return retry(async () => {
    const ecosystem = getEcoSystem();
    const malwareDatabaseUrl =
      malwareDatabaseUrls[
        /** @type {keyof typeof malwareDatabaseUrls} */ (ecosystem)
      ];
    const response = await fetch(malwareDatabaseUrl, {
      method: "HEAD",
    });

    if (!response.ok) {
      throw new Error(
        `Error fetching ${ecosystem} malware database version: ${response.statusText}`
      );
    }
    return response.headers.get("etag") || undefined;
  }, DEFAULT_FETCH_RETRY_ATTEMPTS);
}

/**
 * @returns {Promise<{newPackagesList: NewPackageEntry[], version: string | undefined}>}
 */
export async function fetchNewPackagesList() {
  return retry(async () => {
    const ecosystem = getEcoSystem();
    const url =
      newPackagesListUrls[/** @type {keyof typeof newPackagesListUrls} */ (ecosystem)];

    if (!url) {
      return { newPackagesList: [], version: undefined };
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Error fetching ${ecosystem} new packages list: ${response.statusText}`
      );
    }

    try {
      const newPackagesList = await response.json();
      return {
        newPackagesList,
        version: response.headers.get("etag") || undefined,
      };
    } catch (/** @type {any} */ error) {
      throw new Error(`Error parsing new packages list: ${error.message}`);
    }
  }, DEFAULT_FETCH_RETRY_ATTEMPTS);
}

/**
 * @returns {Promise<string | undefined>}
 */
export async function fetchNewPackagesListVersion() {
  return retry(async () => {
    const ecosystem = getEcoSystem();
    const url =
      newPackagesListUrls[/** @type {keyof typeof newPackagesListUrls} */ (ecosystem)];

    if (!url) {
      return undefined;
    }

    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      throw new Error(
        `Error fetching ${ecosystem} new packages list version: ${response.statusText}`
      );
    }

    return response.headers.get("etag") || undefined;
  }, DEFAULT_FETCH_RETRY_ATTEMPTS);
}

/**
 * Retries an asynchronous function multiple times until it succeeds or exhausts all attempts.
 *
 * @template T
 * @param {() => Promise<T>} func - The asynchronous function to retry
 * @param {number} attempts - The number of attempts
 * @returns {Promise<T>} The return value of the function if successful
 * @throws {Error} The last error encountered if all retry attempts fail
 */
async function retry(func, attempts) {
  let lastError;

  for (let i = 0; i < attempts; i++) {
    try {
      return await func();
    } catch (error) {
      ui.writeVerbose(
        "An error occurred while trying to download Aikido data",
        error
      );
      lastError = error;
    }

    if (i < attempts - 1) {
      // When this is not the last try, back-off exponentially:
      //  1st attempt - 500ms delay
      //  2nd attempt - 1000ms delay
      //  3rd attempt - 2000ms delay
      //  4th attempt - 4000ms delay
      //  ...
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 500));
    }
  }

  throw lastError;
}
