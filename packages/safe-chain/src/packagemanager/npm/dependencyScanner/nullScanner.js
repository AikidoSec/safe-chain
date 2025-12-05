/**
 * @returns {import("./commandArgumentScanner.js").CommandArgumentScanner}
 */
export function nullScanner() {
  return {
    scan: () => [],
    shouldScan: () => false,
  };
}
