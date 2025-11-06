#!/bin/sh
# Generated wrapper for {{PACKAGE_MANAGER}} by safe-chain
# This wrapper intercepts {{PACKAGE_MANAGER}} calls for non-interactive environments

# Function to remove shim from PATH (POSIX-compliant)
remove_shim_from_path() {
    echo "$PATH" | sed "s|$HOME/.safe-chain/shims:||g"
}

if command -v {{AIKIDO_COMMAND}} >/dev/null 2>&1; then
  # Remove shim directory from PATH when calling {{AIKIDO_COMMAND}} to prevent infinite loops
  PATH=$(remove_shim_from_path) exec {{AIKIDO_COMMAND}} "$@"
else
  # Dynamically find original {{PACKAGE_MANAGER}} (excluding this shim directory)
  original_cmd=$(PATH=$(remove_shim_from_path) command -v {{PACKAGE_MANAGER}})
  if [ -n "$original_cmd" ]; then
    exec "$original_cmd" "$@"
  else
    echo "Error: Could not find original {{PACKAGE_MANAGER}}" >&2
    exit 1
  fi
fi
