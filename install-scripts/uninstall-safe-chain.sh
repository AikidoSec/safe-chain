#!/bin/sh

# Downloads and installs safe-chain, depending on the operating system and architecture
#
# Usage with "curl -fsSL {url} | sh" --> See README.md

set -e  # Exit on error

# Configuration
INSTALL_DIR="${HOME}/.safe-chain/bin"

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
    SAFE_CHAIN_LOCATION="$INSTALL_DIR/safe-chain"

    if [ -x "$SAFE_CHAIN_LOCATION" ]; then
        info "Running safe-chain teardown..."
        "$SAFE_CHAIN_LOCATION" teardown || warn "safe-chain teardown encountered issues, continuing with uninstallation..."
    elif command_exists safe-chain; then
        info "Running safe-chain teardown..."
        safe-chain teardown || warn "safe-chain teardown encountered issues, continuing with uninstallation..."
    else
        warn "safe-chain command not found. Proceeding with uninstallation."
    fi

    # Remove npm-based installations (nvm must be checked first)
    remove_nvm_installation
    remove_volta_installation
    remove_npm_installation

    # Remove install dir recursively if it exists
    if [ -d "$INSTALL_DIR" ]; then
        info "Removing installation directory $INSTALL_DIR"
        rm -rf "$INSTALL_DIR" || error "Failed to remove $INSTALL_DIR"
    else
        info "Installation directory $INSTALL_DIR does not exist. Nothing to remove."
    fi
}

main "$@"
