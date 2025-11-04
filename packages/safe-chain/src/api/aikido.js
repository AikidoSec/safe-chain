import fetch from "make-fetch-happen";
import { getEcoSystem, ECOSYSTEM_JS, ECOSYSTEM_PY } from "../config/settings.js";

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
  const ecosystem = getEcoSystem();
  const malwareDatabaseUrl = malwareDatabaseUrls[/** @type {keyof typeof malwareDatabaseUrls} */ (ecosystem)];
  const response = await fetch(malwareDatabaseUrl);
  if (!response.ok) {
    throw new Error(`Error fetching ${ecosystem} malware database: ${response.statusText}`);
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
}

/**
 * @returns {Promise<string | undefined>}
 */
export async function fetchMalwareDatabaseVersion() {
  const ecosystem = getEcoSystem();
  const malwareDatabaseUrl = malwareDatabaseUrls[/** @type {keyof typeof malwareDatabaseUrls} */ (ecosystem)];
  const response = await fetch(malwareDatabaseUrl, {
    method: "HEAD",
  });

  if (!response.ok) {
    throw new Error(
      `Error fetching ${ecosystem} malware database version: ${response.statusText}`
    );
  }
  return response.headers.get("etag") || undefined;
}
