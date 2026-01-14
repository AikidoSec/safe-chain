import fetch from "make-fetch-happen";
import {
  getEcoSystem,
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
} from "../config/settings.js";

const malwareDatabaseUrls = {
  [ECOSYSTEM_JS]: "https://malware-list.aikido.dev/malware_predictions.json",
  [ECOSYSTEM_PY]: "https://malware-list.aikido.dev/malware_pypi.json",
};

/**
 * @typedef {Object} MalwarePackage
 * @property {string} package_name
 * @property {string} version
 * @property {string} reason
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
  }, 3);
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
  }, 3);
}

/**
 * Retries an asynchronous function multiple times until it succeeds or exhausts all attempts.
 *
 * @template T
 * @param {() => Promise<T>} func - The asynchronous function to retry
 * @param {number} times - The number of retry attempts (will execute times + 1 total attempts)
 * @returns {Promise<T>} The return value of the function if successful
 * @throws {Error} The last error encountered if all retry attempts fail
 */
async function retry(func, times) {
  let lastError;

  for (let i = 0; i <= times; i++) {
    try {
      return await func();
    } catch (error) {
      lastError = error;
    }

    if (i < times) {
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 500));
    }
  }

  throw lastError;
}
