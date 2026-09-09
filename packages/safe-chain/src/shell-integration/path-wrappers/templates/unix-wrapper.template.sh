#!/bin/sh
# Generated wrapper for {{PACKAGE_MANAGER}} by safe-chain
# This wrapper intercepts {{PACKAGE_MANAGER}} calls for non-interactive environments

# Trim trailing slashes; result in $_rtrim_out ("/" stays "/")
_rtrim_slashes() {
    _rtrim_out=$1
    while [ "$_rtrim_out" != "/" ] && [ "${_rtrim_out%/}" != "$_rtrim_out" ]; do
        _rtrim_out=${_rtrim_out%/}
    done
}

# Function to remove shim from PATH (POSIX-compliant)
remove_shim_from_path() {
    # Derive the shim directory from $0 with parameter expansion instead of
    # dirname(1) so this keeps working even when PATH is missing system dirs
    case "$0" in
        */*) _dir=${0%/*} ;;
        *) _dir=. ;;
    esac
    # Physical path — on macOS /tmp is a symlink to /private/tmp, so pwd -P
    # resolves to /private/tmp/… but PATH may still contain /tmp/….
    _safe_chain_phys=$(CDPATH= cd -- "$_dir" 2>/dev/null && pwd -P)
    _rtrim_slashes "$_dir"
    _dir_trimmed=$_rtrim_out
    _newpath=""
    _rest="$PATH:"
    while [ -n "$_rest" ]; do
        _entry=${_rest%%:*}
        _rest=${_rest#*:}
        # Compare with trailing slashes trimmed so "/dir/" still matches "/dir"
        _rtrim_slashes "$_entry"
        _trimmed=$_rtrim_out
        if [ -n "$_safe_chain_phys" ] && [ "$_trimmed" = "$_safe_chain_phys" ]; then
            continue
        fi
        case "$_dir_trimmed" in
            /*) [ "$_trimmed" = "$_dir_trimmed" ] && continue ;;
        esac
        _newpath="${_newpath}${_entry}:"
    done
    echo "${_newpath%:}"
}

if command -v safe-chain >/dev/null 2>&1; then
  # Remove shim directory from PATH when calling {{AIKIDO_COMMAND}} to prevent infinite loops.
  # Unset PKG_EXECPATH so the yao-pkg bootstrap inside the safe-chain binary doesn't
  # mistake argv[1] for a script path and try to resolve "{{PACKAGE_MANAGER}}" against cwd.
  unset PKG_EXECPATH
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
