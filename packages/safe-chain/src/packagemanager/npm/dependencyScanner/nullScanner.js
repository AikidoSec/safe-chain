/**
 * @returns {import("./commandArgumentScanner.js").CommandArgumentScanner}
 */
export function nullScanner() {
  return {
    scan: async () => [],
    shouldScan: () => false,
  };
}
