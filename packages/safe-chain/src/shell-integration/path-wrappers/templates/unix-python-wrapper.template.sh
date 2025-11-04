#!/bin/sh
# Generated wrapper for python/python3 by safe-chain
# Intercepts `python[3] -m pip[...]` in CI environments

# Function to remove shim from PATH (POSIX-compliant)
remove_shim_from_path() {
    echo "$PATH" | sed "s|$HOME/.safe-chain/shims:||g"
}

# Determine which python variant we were invoked as based on the script name
invoked=$(basename "$0")

# If invoked as `python -m pip[...]` or `python3 -m pip[...]`, route to aikido
if [ "$1" = "-m" ] && [ -n "$2" ] && echo "$2" | grep -Eq '^pip(3)?$'; then
  mod="$2"
  shift 2
  if [ "$invoked" = "python3" ] || [ "$mod" = "pip3" ]; then
    PATH=$(remove_shim_from_path) exec aikido-pip3 "$@"
  else
    PATH=$(remove_shim_from_path) exec aikido-pip "$@"
  fi
fi

# Otherwise, find and exec the real python/python3 matching the invoked name
original_cmd=$(PATH=$(remove_shim_from_path) command -v "$invoked")
if [ -n "$original_cmd" ]; then
  exec "$original_cmd" "$@"
else
  echo "Error: Could not find original $invoked" >&2
  exit 1
fi
