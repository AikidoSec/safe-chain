#!/bin/sh
# Generated wrapper for {{PACKAGE_MANAGER}} by safe-chain
# This wrapper intercepts {{PACKAGE_MANAGER}} calls for non-interactive environments

# Function to remove shim from PATH (POSIX-compliant)
remove_shim_from_path() {
    _safe_chain_shims=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd -P)
    echo "$PATH" | sed "s|${_safe_chain_shims}:||g"
}

if command -v safe-chain >/dev/null 2>&1; then
  # Remove shim directory from PATH when calling {{AIKIDO_COMMAND}} to prevent infinite loops
  PATH=$(remove_shim_from_path) exec safe-chain {{PACKAGE_MANAGER}} "$@"
else
  # safe-chain is not reachable — warn the user so they know protection is inactive
  printf "\033[43;30mWarning:\033[0m safe-chain is not available to protect you from installing malware. {{PACKAGE_MANAGER}} will run without it.\n" >&2

  # Dynamically find original {{PACKAGE_MANAGER}} (excluding this shim directory)
  original_cmd=$(PATH=$(remove_shim_from_path) command -v {{PACKAGE_MANAGER}})
  if [ -n "$original_cmd" ]; then
    exec "$original_cmd" "$@"
  else
    echo "Error: Could not find original {{PACKAGE_MANAGER}}" >&2
    exit 1
  fi
fi
