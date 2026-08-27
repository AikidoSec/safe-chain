#!/bin/sh

# Downloads and installs Aikido Endpoint Protection on Linux
#
# Usage: curl -fsSL <url> | sudo sh -s -- --token <TOKEN> [--headless] [--ci-cd]

set -e  # Exit on error

# Configuration
BASE_URL="https://github.com/AikidoSec/safechain-internals/releases/download/v1.8.2"

# Checksums per artifact, keyed by asset name
SHA256_AMD64_DEB="ab4362e13abb285656421922cd2eb4d70663a0f94ab5116492c353cd4da2f272"
SHA256_ARM64_DEB="e9df51983df60004152e1f477b1f57108e56e4aa7c3137f6cda23acd97763856"
SHA256_AMD64_EL9_RPM="767d4539fffa02c20b64286ef762c9df33bc0d066f4fc6ea3a511603b377b0ce"
SHA256_ARM64_EL9_RPM="beb9a1a492471cf3709ff728c2ec9f2b3701f08a487f871003913df496e4c443"
SHA256_AMD64_EL10_RPM="fb41d55cf74b5a6b2b9c0a41d5cc1d584b55f10af98107334f468cdb0844df1e"
SHA256_ARM64_EL10_RPM="607edee844286a7f0363a642781b4604b10bb2fbb5d9282ff2d5b158da5537cb"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Helper functions
info() {
    printf "${GREEN}[INFO]${NC} %s\n" "$1"
}

error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
    exit 1
}

# Download file
download() {
    url="$1"
    dest="$2"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$dest" || error "Failed to download from $url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$url" -O "$dest" || error "Failed to download from $url"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Verify SHA256 checksum
verify_checksum() {
    file="$1"
    expected="$2"

    if command -v sha256sum >/dev/null 2>&1; then
        actual=$(sha256sum "$file" | awk '{ print $1 }')
    elif command -v shasum >/dev/null 2>&1; then
        actual=$(shasum -a 256 "$file" | awk '{ print $1 }')
    elif command -v openssl >/dev/null 2>&1; then
        actual=$(openssl dgst -sha256 "$file" | awk '{ print $NF }')
    else
        error "No SHA256 tool found. Please install coreutils or openssl."
    fi

    if [ "$actual" != "$expected" ]; then
        error "Checksum verification failed. Expected: $expected, Got: $actual"
    fi

    info "Checksum verified successfully."
}

# Cleanup temporary files
cleanup() {
    if [ "${PKG_FILE_OWNED:-}" = "1" ] && [ -n "${PKG_FILE:-}" ] && [ -f "$PKG_FILE" ]; then
        rm -f "$PKG_FILE"
    fi
}

# Parse command-line arguments
parse_arguments() {
    TOKEN=""
    CI_CD=""
    HEADLESS=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --token)
                if [ -z "${2:-}" ]; then
                    error "--token requires a value"
                fi
                TOKEN="$2"
                shift 2
                ;;
            --ci-cd)
                CI_CD="1"
                shift
                ;;
            --headless)
                HEADLESS="1"
                shift
                ;;
            *)
                error "Unknown argument: $1"
                ;;
        esac
    done
}

# Determine amd64 or arm64
detect_arch() {
    machine=$(uname -m)

    case "$machine" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $machine. Only amd64 (x86_64) and arm64 (aarch64) are supported."
            ;;
    esac
}

# Map the RHEL-family major version to the Enterprise Linux build we ship
detect_el_version() {
    major="${OS_VERSION_ID%%.*}"

    case "$major" in
        9)
            EL_VERSION="el9"
            ;;
        10)
            EL_VERSION="el10"
            ;;
        *)
            error "Unsupported RPM-based distribution: ${OS_ID:-unknown} ${OS_VERSION_ID:-unknown}. Only Enterprise Linux 9 and 10 are supported."
            ;;
    esac
}

# Determine deb or rpm, and for rpm the Enterprise Linux version
detect_package_type() {
    OS_ID=""
    OS_ID_LIKE=""
    OS_VERSION_ID=""

    if [ -r /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_ID="${ID:-}"
        OS_ID_LIKE="${ID_LIKE:-}"
        OS_VERSION_ID="${VERSION_ID:-}"
    fi

    case "$OS_ID" in
        debian|ubuntu|linuxmint|pop|raspbian|elementary|kali|zorin|neon)
            PKG_TYPE="deb"
            return
            ;;
        rhel|centos|rocky|almalinux|ol|oracle|scientific|cloudlinux|virtuozzo)
            PKG_TYPE="rpm"
            detect_el_version
            return
            ;;
        amzn)
            # Amazon Linux 2023 tracks the el9 glibc; older releases are too old
            if [ "$OS_VERSION_ID" = "2023" ]; then
                PKG_TYPE="rpm"
                EL_VERSION="el9"
                return
            fi
            error "Unsupported distribution: Amazon Linux ${OS_VERSION_ID:-unknown}. Only Amazon Linux 2023 is supported."
            ;;
    esac

    # Unrecognized distribution: fall back to the family it declares
    case " $OS_ID_LIKE " in
        *" debian "*)
            PKG_TYPE="deb"
            return
            ;;
        *" rhel "*|*" centos "*|*" fedora "*)
            PKG_TYPE="rpm"
            detect_el_version
            return
            ;;
    esac

    # No usable os-release: a Debian-based system is still safe to detect from dpkg
    if command -v dpkg >/dev/null 2>&1; then
        PKG_TYPE="deb"
        return
    fi

    error "Unsupported distribution: ${OS_ID:-unknown} ${OS_VERSION_ID:-unknown}. Only Debian-based and Enterprise Linux 9/10 distributions are supported."
}

# Resolve the asset to download and its expected checksum
detect_package() {
    detect_arch
    detect_package_type

    if [ "$PKG_TYPE" = "deb" ]; then
        ASSET="EndpointProtection-${ARCH}.deb"
        command -v dpkg >/dev/null 2>&1 || error "dpkg not found, which is required to install the .deb package."
    else
        ASSET="EndpointProtection-${ARCH}.${EL_VERSION}.rpm"
        command -v rpm >/dev/null 2>&1 || error "rpm not found, which is required to install the .rpm package."
    fi

    case "$ASSET" in
        EndpointProtection-amd64.deb) EXPECTED_SHA256="$SHA256_AMD64_DEB" ;;
        EndpointProtection-arm64.deb) EXPECTED_SHA256="$SHA256_ARM64_DEB" ;;
        EndpointProtection-amd64.el9.rpm) EXPECTED_SHA256="$SHA256_AMD64_EL9_RPM" ;;
        EndpointProtection-arm64.el9.rpm) EXPECTED_SHA256="$SHA256_ARM64_EL9_RPM" ;;
        EndpointProtection-amd64.el10.rpm) EXPECTED_SHA256="$SHA256_AMD64_EL10_RPM" ;;
        EndpointProtection-arm64.el10.rpm) EXPECTED_SHA256="$SHA256_ARM64_EL10_RPM" ;;
        *) error "No package available for this system ($ASSET)." ;;
    esac

    if [ -z "$EXPECTED_SHA256" ]; then
        error "No checksum configured for $ASSET. Please report this to Aikido support."
    fi
}

# Run the package manager with the settings the installer reads from the environment.
# CI/CD wins if both flags are set: do not also export AIKIDO_HEADLESS.
run_installer() {
    if [ -n "$CI_CD" ]; then
        AIKIDO_TOKEN="$TOKEN" AIKIDO_CI_CD="$CI_CD" "$@"
    elif [ -n "$HEADLESS" ]; then
        AIKIDO_TOKEN="$TOKEN" AIKIDO_HEADLESS="$HEADLESS" "$@"
    else
        AIKIDO_TOKEN="$TOKEN" "$@"
    fi
}

# Install the .deb through apt-get so hard dependencies get resolved. apt is the
# only step here that pulls Recommends, so that is what headless and CI/CD
# runs opt out of.
install_deb() {
    if ! command -v apt-get >/dev/null 2>&1; then
        run_installer dpkg -i "$PKG_FILE"
        return
    fi

    export DEBIAN_FRONTEND=noninteractive
    if ! apt-get update; then
        info "Could not refresh package lists. Continuing with cached lists."
    fi

    # --reinstall so re-running for the same version still applies the token
    set -- apt-get install -y --reinstall
    if [ -n "$CI_CD" ] || [ -n "$HEADLESS" ]; then
        set -- "$@" --no-install-recommends
    fi

    run_installer "$@" "$PKG_FILE"
}

# True when the file matches a version that is already installed
rpm_already_installed() {
    nevra=$(rpm -qp --queryformat '%{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}' "$PKG_FILE" 2>/dev/null) || return 1
    [ -n "$nevra" ] || return 1
    rpm -q "$nevra" >/dev/null 2>&1
}

# Install the .rpm through dnf/yum so hard dependencies get resolved. Weak
# dependencies are dnf's doing, so headless and CI/CD runs turn them off.
install_rpm() {
    if command -v dnf >/dev/null 2>&1; then
        set -- dnf
    elif command -v yum >/dev/null 2>&1; then
        set -- yum
    else
        # --replacepkgs so re-running for the same version still applies the token
        run_installer rpm -Uvh --replacepkgs "$PKG_FILE"
        return
    fi

    # dnf skips the scriptlets for an already installed version and refuses to
    # reinstall one that is absent, so the verb depends on what is on the system
    if rpm_already_installed; then
        set -- "$@" reinstall -y
    else
        set -- "$@" install -y
    fi

    if [ -n "$CI_CD" ] || [ -n "$HEADLESS" ]; then
        set -- "$@" --setopt=install_weak_deps=False
    fi

    run_installer "$@" "$PKG_FILE"
}

# Main installation
main() {
    parse_arguments "$@"

    # 1. Check if we're running on Linux
    if [ "$(uname -s)" != "Linux" ]; then
        error "This script is only supported on Linux."
    fi

    # Check if we're running as root
    if [ "$(id -u)" -ne 0 ]; then
        error "Root privileges required. Please re-run with sudo, e.g.: curl -fsSL <url> | sudo sh -s -- --token <TOKEN>"
    fi

    # Check if token is provided via command argument
    if [ -z "$TOKEN" ]; then
        error "Token is required. Pass it with --token <TOKEN>."
    fi

    # Validate token to prevent injection
    case "$TOKEN" in
        *[\"\'\;\`\$\ ]*)
            error "Invalid token format. Token must not contain quotes, semicolons, backticks, dollar signs, or whitespace."
            ;;
    esac

    # 2. Determine which package this system needs
    detect_package
    info "Detected ${OS_ID:-unknown} ${OS_VERSION_ID:-unknown} ($ARCH), using $ASSET"

    if [ -n "${AIKIDO_PACKAGE_FILE:-}" ]; then
        case "$AIKIDO_PACKAGE_FILE" in
            *://*)
                error "AIKIDO_PACKAGE_FILE must be a local file, not a URL."
                ;;
        esac
        if [ ! -f "$AIKIDO_PACKAGE_FILE" ] || [ ! -r "$AIKIDO_PACKAGE_FILE" ]; then
            error "Package file not found or not readable: $AIKIDO_PACKAGE_FILE"
        fi
        case "$AIKIDO_PACKAGE_FILE" in
            *.deb)
                [ "$PKG_TYPE" = "deb" ] || error "AIKIDO_PACKAGE_FILE is a .deb but this system needs an RPM ($ASSET)."
                ;;
            *.rpm)
                [ "$PKG_TYPE" = "rpm" ] || error "AIKIDO_PACKAGE_FILE is an RPM but this system needs a .deb ($ASSET)."
                ;;
            *)
                error "AIKIDO_PACKAGE_FILE must be a .deb or .rpm (got: $AIKIDO_PACKAGE_FILE)"
                ;;
        esac
        PKG_FILE="$AIKIDO_PACKAGE_FILE"
        PKG_FILE_OWNED=0
        info "Using local package $PKG_FILE (checksum skipped)"
    else
        # 3. Download and verify checksum
        PKG_FILE=$(mktemp "/tmp/AikidoEndpoint.XXXXXX.${ASSET##*.}")
        PKG_FILE_OWNED=1
        trap cleanup EXIT

        info "Downloading Aikido Endpoint Protection..."
        download "${BASE_URL}/${ASSET}" "$PKG_FILE"
        chmod 644 "$PKG_FILE"

        info "Verifying checksum..."
        verify_checksum "$PKG_FILE" "$EXPECTED_SHA256"
    fi

    # 4. Install the package
    info "Installing Aikido Endpoint Protection..."
    if [ "$PKG_TYPE" = "deb" ]; then
        install_deb
    else
        install_rpm
    fi

    info "Aikido Endpoint Protection installed successfully!"
}

main "$@"
