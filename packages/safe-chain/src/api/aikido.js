import fetch from "make-fetch-happen";
import { getEcoSystem, ECOSYSTEM_JS, ECOSYSTEM_PY, ECOSYSTEM_ALL } from "../config/settings.js";

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
  
  // For ECOSYSTEM_ALL, fetch both databases concurrently
  if (ecosystem === ECOSYSTEM_ALL) {
    const [jsResponse, pyResponse] = await Promise.all([
      fetch(malwareDatabaseUrls[ECOSYSTEM_JS]),
      fetch(malwareDatabaseUrls[ECOSYSTEM_PY])
    ]);
    
    if (!jsResponse.ok) {
      throw new Error(`Error fetching JS malware database: ${jsResponse.statusText}`);
    }
    if (!pyResponse.ok) {
      throw new Error(`Error fetching Python malware database: ${pyResponse.statusText}`);
    }
    
    try {
      const [jsDatabase, pyDatabase] = await Promise.all([
        jsResponse.json(),
        pyResponse.json()
      ]);
      
      const mergedDatabase = [...jsDatabase, ...pyDatabase];
      
      // Use JS etag for version (or combine both if needed)
      const version = jsResponse.headers.get("etag") || pyResponse.headers.get("etag") || undefined;
      
      return {
        malwareDatabase: mergedDatabase,
        version: version,
      };
    } catch (/** @type {any} */ error) {
      throw new Error(`Error parsing malware database: ${error.message}`);
    }
  }
  
  // Single ecosystem mode (existing behavior)
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
  
  // For ECOSYSTEM_ALL, check both databases
  if (ecosystem === ECOSYSTEM_ALL) {
    const [jsResponse, pyResponse] = await Promise.all([
      fetch(malwareDatabaseUrls[ECOSYSTEM_JS], { method: "HEAD" }),
      fetch(malwareDatabaseUrls[ECOSYSTEM_PY], { method: "HEAD" })
    ]);
    
    if (!jsResponse.ok) {
      throw new Error(`Error fetching JS malware database version: ${jsResponse.statusText}`);
    }
    if (!pyResponse.ok) {
      throw new Error(`Error fetching Python malware database version: ${pyResponse.statusText}`);
    }
    
    // Combine both etags for version (so cache invalidates if either changes)
    const jsEtag = jsResponse.headers.get("etag") || "";
    const pyEtag = pyResponse.headers.get("etag") || "";
    return jsEtag && pyEtag ? `${jsEtag}|${pyEtag}` : undefined;
  }
  
  // Single ecosystem mode (existing behavior)
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
