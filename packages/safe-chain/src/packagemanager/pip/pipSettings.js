// Constant for pip package manager name
export const PIP_PACKAGE_MANAGER = "pip";

// Enum of possible Python/pip invocations for Safe Chain interception
export const PIP_INVOCATIONS = {
  PIP: { command: "pip", args: [] },
  PIP3: { command: "pip3", args: [] },
  PY_PIP: { command: "python", args: ["-m", "pip"] },
  PY3_PIP: { command: "python3", args: ["-m", "pip"] }
};

/**
 * @type {{ command: string, args: string[] }}
 */
let currentInvocation = PIP_INVOCATIONS.PY3_PIP; // Default to python3 -m pip

/**
 * @param {{ command: string, args: string[] }} invocation
 */
export function setCurrentPipInvocation(invocation) {
  console.debug('[safe-chain debug] setCurrentPipInvocation:', invocation);
  currentInvocation = invocation;
}

/**
 * @returns {{ command: string, args: string[] }}
 */
export function getCurrentPipInvocation() {
  console.debug('[safe-chain debug] getCurrentPipInvocation:', currentInvocation);
  return currentInvocation;
}
