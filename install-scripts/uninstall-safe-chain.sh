#!/bin/sh

# Downloads and installs safe-chain, depending on the operating system and architecture
#
# Usage with "curl -fsSL {url} | sh" --> See README.md

set -e  # Exit on error

# Configuration

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
info() {
    printf "${GREEN}[INFO]${NC} %s\n" "$1"
}

warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
    exit 1
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Resolves a path to its canonical filesystem location when possible.
# Follows symlinks so binary validation can inspect the real installed path.
resolve_path() {
    target="$1"

    while [ -L "$target" ]; do
        link_target=$(readlink "$target" 2>/dev/null || echo "")
        if [ -z "$link_target" ]; then
            break
        fi

        case "$link_target" in
            /*) target="$link_target" ;;
            *)
                target="$(dirname "$target")/$link_target"
                ;;
        esac
    done

    target_dir=$(dirname "$target")
    target_name=$(basename "$target")

    if cd "$target_dir" 2>/dev/null; then
        printf '%s/%s\n' "$(pwd -P)" "$target_name"
    else
        printf '%s\n' "$target"
    fi
}

# Derives the safe-chain base install directory from a packaged binary path.
# Rejects wrapper scripts and paths that do not match the expected bin layout.
derive_install_dir_from_binary() {
    binary_path="$1"

    if [ -z "$binary_path" ]; then
        return 1
    fi

    resolved_path=$(resolve_path "$binary_path")
    binary_name=$(basename "$resolved_path")
    case "$binary_name" in
        safe-chain|safe-chain.exe) ;;
        *) return 1 ;;
    esac

    case "$resolved_path" in
        *.js|*.cjs|*.mjs|*.cmd|*.ps1) return 1 ;;
    esac

    binary_dir=$(dirname "$resolved_path")
    if [ "$(basename "$binary_dir")" != "bin" ]; then
        return 1
    fi

    dirname "$binary_dir"
}

# Determines the installed safe-chain base directory for uninstall.
# Prefers the binary-reported location, then infers it from PATH, then falls back to ~/.safe-chain.
get_install_dir() {
    reported_install_dir=$(get_reported_install_dir || true)
    if [ -n "$reported_install_dir" ]; then
        printf '%s\n' "$reported_install_dir"
        return 0
    fi

    command_path=$(get_safe_chain_command_path || true)
    install_dir=$(derive_install_dir_from_binary "$command_path" || true)
    if [ -n "$install_dir" ]; then
        printf '%s\n' "$install_dir"
        return 0
    fi

    printf '%s\n' "${HOME}/.safe-chain"
}

# Returns the current safe-chain command path from PATH.
# Fails when safe-chain is not currently resolvable.
get_safe_chain_command_path() {
    if ! command_exists safe-chain; then
        return 1
    fi

    command -v safe-chain
}

# Returns the safe-chain command path only when it resolves to a valid packaged binary install.
# Prevents the uninstaller from invoking arbitrary PATH entries.
get_validated_safe_chain_command_path() {
    command_path=$(get_safe_chain_command_path || true)
    if [ -z "$command_path" ]; then
        return 1
    fi

    install_dir=$(derive_install_dir_from_binary "$command_path" || true)
    if [ -z "$install_dir" ]; then
        return 1
    fi

    printf '%s\n' "$command_path"
}

# Asks the validated safe-chain binary for its install directory via get-install-dir.
# Returns nothing if the command is unavailable or the lookup fails.
get_reported_install_dir() {
    safe_chain_path=$(get_validated_safe_chain_command_path || true)
    if [ -z "$safe_chain_path" ]; then
        return 1
    fi

    install_dir=$("$safe_chain_path" get-install-dir 2>/dev/null || true)
    if [ -n "$install_dir" ]; then
        printf '%s\n' "$install_dir"
        return 0
    fi

    return 1
}

# Locates the installed safe-chain binary to use for teardown.
# Checks the discovered install dir first, then falls back to a validated PATH entry.
find_installed_safe_chain_binary() {
    dot_safe_chain="$1"

    safe_chain_location="$dot_safe_chain/bin/safe-chain"
    if [ -x "$safe_chain_location" ]; then
        printf '%s\n' "$safe_chain_location"
        return 0
    fi

    command_path=$(get_validated_safe_chain_command_path || true)
    if [ -n "$command_path" ]; then
        printf '%s\n' "$command_path"
        return 0
    fi

    return 1
}

# Runs safe-chain teardown before removing files.
# Continues with uninstall even if teardown is unavailable or fails.
run_safe_chain_teardown() {
    safe_chain_command="$1"

    if [ -z "$safe_chain_command" ]; then
        warn "safe-chain command not found. Proceeding with uninstallation."
        return
    fi

    info "Running safe-chain teardown..."
    "$safe_chain_command" teardown || warn "safe-chain teardown encountered issues, continuing with uninstallation..."
}

# Check and uninstall npm global package if present
remove_npm_installation() {
    if ! command_exists npm; then
        return
    fi

    # Check if safe-chain is installed as an npm global package
    if npm list -g @aikidosec/safe-chain >/dev/null 2>&1; then
        info "Detected npm global installation of @aikidosec/safe-chain"
        info "Uninstalling npm version before installing binary version..."

        if npm uninstall -g @aikidosec/safe-chain >/dev/null 2>&1; then
            info "Successfully uninstalled npm version"
        else
            warn "Failed to uninstall npm version automatically"
            warn "Please run: npm uninstall -g @aikidosec/safe-chain"
        fi
    fi
}

# Check and uninstall Volta-managed package if present
remove_volta_installation() {
    if ! command_exists volta; then
        return
    fi

    # Volta manages global packages in its own directory
    # Check if safe-chain is installed via Volta
    if volta list safe-chain >/dev/null 2>&1; then
        info "Detected Volta installation of @aikidosec/safe-chain"
        info "Uninstalling Volta version before installing binary version..."

        if volta uninstall @aikidosec/safe-chain >/dev/null 2>&1; then
            info "Successfully uninstalled Volta version"
        else
            warn "Failed to uninstall Volta version automatically"
            warn "Please run: volta uninstall @aikidosec/safe-chain"
        fi
    fi
}

# Check and uninstall nvm-managed package if present across all Node versions
remove_nvm_installation() {
    # This script is run in sh shell for greatest compatibility.
    # Because nvm is usually setup in bash/zsh/fish startup scripts, we need to source it.
    # Otherwise it won't be available in sh.
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        # Source nvm to make it available in this script
        . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
    elif [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
    fi

    # Check if nvm is now available
    if ! command_exists nvm; then
        return
    fi

    # Get list of installed Node versions
    nvm_versions=$(nvm list 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo "")

    if [ -z "$nvm_versions" ]; then
        return
    fi

    # Track if we found any installations
    found_installation=false
    uninstall_failed=false
    current_version=$(nvm current 2>/dev/null || echo "")

    # Check each version for safe-chain installation
    for version in $nvm_versions; do
        # Check if this version has safe-chain installed
        # Use nvm exec to run npm list in the context of that Node version
        if nvm exec "$version" npm list -g @aikidosec/safe-chain >/dev/null 2>&1; then
            if [ "$found_installation" = false ]; then
                info "Detected nvm installation(s) of @aikidosec/safe-chain"
                info "Uninstalling from all Node versions..."
                found_installation=true
            fi

            info "  Removing from Node $version..."
            if nvm exec "$version" npm uninstall -g @aikidosec/safe-chain >/dev/null 2>&1; then
                info "  Successfully uninstalled from Node $version"
            else
                warn "  Failed to uninstall from Node $version"
                uninstall_failed=true
            fi
        fi
    done

    # Restore original Node version if it was set
    if [ -n "$current_version" ] && [ "$current_version" != "none" ] && [ "$current_version" != "system" ]; then
        nvm use "$current_version" >/dev/null 2>&1 || true
    fi

    # Show warning if any uninstall failed (but don't error out during uninstall)
    if [ "$uninstall_failed" = true ]; then
        warn "Failed to uninstall @aikidosec/safe-chain from some nvm Node versions"
        warn "You may need to manually run: nvm exec <version> npm uninstall -g @aikidosec/safe-chain"
    fi
}

# Main uninstallation
main() {
    DOT_SAFE_CHAIN=$(get_install_dir)
    SAFE_CHAIN_COMMAND=$(find_installed_safe_chain_binary "$DOT_SAFE_CHAIN" || true)
    run_safe_chain_teardown "$SAFE_CHAIN_COMMAND"

    # Check for existing safe-chain installation through nvm, volta, or npm
    remove_npm_installation
    remove_volta_installation
    remove_nvm_installation

    # Remove install dir recursively if it exists
    if [ -d "$DOT_SAFE_CHAIN" ]; then
        info "Removing installation directory $DOT_SAFE_CHAIN"
        rm -rf "$DOT_SAFE_CHAIN" || error "Failed to remove $DOT_SAFE_CHAIN"
    else
        info "Installation directory $DOT_SAFE_CHAIN does not exist. Nothing to remove."
    fi
}

main "$@"
