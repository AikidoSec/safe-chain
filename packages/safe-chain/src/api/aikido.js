import fetch from "make-fetch-happen";

const malwareDatabaseUrl =
  "https://malware-list.aikido.dev/malware_predictions.json";

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
  const response = await fetch(malwareDatabaseUrl);
  if (!response.ok) {
    throw new Error(`Error fetching malware database: ${response.statusText}`);
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
  const response = await fetch(malwareDatabaseUrl, {
    method: "HEAD",
  });
  if (!response.ok) {
    throw new Error(
      `Error fetching malware database version: ${response.statusText}`
    );
  }
  return response.headers.get("etag") || undefined;
}
