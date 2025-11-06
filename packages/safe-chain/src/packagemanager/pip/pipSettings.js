export const PIP_PACKAGE_MANAGER = "pip";

// All supported python/pip invocations for Safe Chain interception
export const PIP_INVOCATIONS = {
  PIP: { command: "pip", args: [] },
  PIP3: { command: "pip3", args: [] },
  PY_PIP: { command: "python", args: ["-m", "pip"] },
  PY3_PIP: { command: "python3", args: ["-m", "pip"] },
  PY_PIP3: { command: "python", args: ["-m", "pip3"] },
  PY3_PIP3: { command: "python3", args: ["-m", "pip3"] }
};

/**
 * @type {{ command: string, args: string[] }}
 */
let currentInvocation = PIP_INVOCATIONS.PY3_PIP; // Default to python3 -m pip

/**
 * @param {{ command: string, args: string[] }} invocation
 */
export function setCurrentPipInvocation(invocation) {
  currentInvocation = invocation;
}

/**
 * @returns {{ command: string, args: string[] }}
 */
export function getCurrentPipInvocation() {
  return currentInvocation;
}
