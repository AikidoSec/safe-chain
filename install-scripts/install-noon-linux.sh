#!/bin/sh

# Downloads and installs Noon Device Protection on a Linux desktop
#
# Usage: curl -fsSL <url> | sudo sh -s -- --token <TOKEN>
#    or: curl -fsSL <url> | sudo AIKIDO_TOKEN=<TOKEN> sh
#
#   --token      enrollment token. Optional when AIKIDO_TOKEN is set, or when this
#                machine already has a token. --token wins over AIKIDO_TOKEN.

set -e

# Configuration
BASE_URL="https://aikido-endpoint-binaries.s3.eu-west-1.amazonaws.com/v1.10.24"

# Checksums per artifact, keyed by asset name
SHA256_AMD64_DEB="efda42a50ecbf79e1447fa10c4e401f4944534712f7bb00660dc839d1b23d652"
SHA256_ARM64_DEB="ea7ed38af6bd7602528823a98d784c284f96bc61eae8a8aff357db76fc86c5a8"
SHA256_AMD64_EL9_RPM="5959520d9ce8f880d297263f82d07cf2a666ac3cfea13d30f143174c3a864d65"
SHA256_ARM64_EL9_RPM="9436a19fe5c1f2cc65a699f579e316f89da1fb79705b1564352b2a5a670f9bd8"
SHA256_AMD64_EL10_RPM="31cf6a3c6baf058604b9782361b789911e559e0b78de9ba89c98d920ab2a39aa"
SHA256_ARM64_EL10_RPM="f7fcb294d4a25d23c7bf194c0e85670a97b73d2ba958e55c7c1eb48647d051a7"

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

is_wsl1() {
    awk '$2 == "/" && ($3 == "wslfs" || $3 == "lxfs") { found = 1 }
         END { exit !found }' /proc/mounts 2>/dev/null && return 0
    grep -qE -- '-Microsoft$' /proc/sys/kernel/osrelease 2>/dev/null
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

    while [ $# -gt 0 ]; do
        case "$1" in
            --token)
                if [ -z "${2:-}" ]; then
                    error "--token requires a value"
                fi
                case "$2" in
                    --*)
                        error "--token requires a value"
                        ;;
                esac
                TOKEN="$2"
                shift 2
                ;;
            --headless|--container|--ci-cd)
                error "$1 is not supported. Noon Device Protection installs on Linux desktops only."
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
        fedora)
            # Fedora 44 is the tested release. It installs the el10 RPM.
            # A later major stays refused until that version is tested.
            if [ "$OS_VERSION_ID" = "44" ]; then
                PKG_TYPE="rpm"
                EL_VERSION="el10"
                return
            fi
            error "Unsupported distribution: Fedora ${OS_VERSION_ID:-unknown}. Only Fedora 44 is supported."
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
        ASSET="NoonSecurity-${ARCH}.deb"
        command -v dpkg >/dev/null 2>&1 || error "dpkg not found, which is required to install the .deb package."
    else
        ASSET="NoonSecurity-${ARCH}.${EL_VERSION}.rpm"
        command -v rpm >/dev/null 2>&1 || error "rpm not found, which is required to install the .rpm package."
    fi

    case "$ASSET" in
        NoonSecurity-amd64.deb) EXPECTED_SHA256="$SHA256_AMD64_DEB" ;;
        NoonSecurity-arm64.deb) EXPECTED_SHA256="$SHA256_ARM64_DEB" ;;
        NoonSecurity-amd64.el9.rpm) EXPECTED_SHA256="$SHA256_AMD64_EL9_RPM" ;;
        NoonSecurity-arm64.el9.rpm) EXPECTED_SHA256="$SHA256_ARM64_EL9_RPM" ;;
        NoonSecurity-amd64.el10.rpm) EXPECTED_SHA256="$SHA256_AMD64_EL10_RPM" ;;
        NoonSecurity-arm64.el10.rpm) EXPECTED_SHA256="$SHA256_ARM64_EL10_RPM" ;;
        *) error "No package available for this system ($ASSET)." ;;
    esac

    if [ -z "$EXPECTED_SHA256" ]; then
        error "No checksum configured for $ASSET. Please report this to Noon support."
    fi
}

# Enrollment file written by the package. An upgrade leaves it in place, so a
# new token is required only when this file has none.
ENDPOINT_CONFIG="/var/lib/aikidosecurity/endpoint-protection/run/config.json"

# Non-empty token in config.json, compact {"token":"x"} or the daemon's
# pretty-printed "token": "x". "token":"" is not enrolled.
config_has_token() {
    [ -f "$1" ] || return 1
    grep -Eq '"token"[[:space:]]*:[[:space:]]*"[^"[:space:]]' "$1"
}

# Run the package manager with the token the installer reads from the environment.
# Drop inherited mode vars first so sudo -E / ambient env cannot turn this
# desktop install into a headless or container one.
run_installer() {
    unset AIKIDO_CONTAINER AIKIDO_HEADLESS AIKIDO_CI_CD
    AIKIDO_TOKEN="$TOKEN" "$@"
}

# Install the .deb through apt-get so hard dependencies get resolved, including
# the GTK/WebKit Recommends the desktop UI needs.
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
    run_installer apt-get install -y --reinstall "$PKG_FILE"
}

# True when the file matches a version that is already installed
rpm_already_installed() {
    nevra=$(rpm -qp --queryformat '%{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}' "$PKG_FILE" 2>/dev/null) || return 1
    [ -n "$nevra" ] || return 1
    rpm -q "$nevra" >/dev/null 2>&1
}

# Install the .rpm through dnf/yum so hard dependencies get resolved, including
# the weak dependencies the desktop UI needs.
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

    run_installer "$@" "$PKG_FILE"
}

# Main installation
main() {
    parse_arguments "$@"

    # 1. Check if we're running on Linux
    if [ "$(uname -s)" != "Linux" ]; then
        error "This script is only supported on Linux."
    fi

    if is_wsl1; then
        error "WSL1 is not supported. Noon Device Protection requires WSL2."
    fi

    # Check if we're running as root
    if [ "$(id -u)" -ne 0 ]; then
        error "Root privileges required. Please re-run with sudo, e.g.: curl -fsSL <url> | sudo sh -s -- --token <TOKEN>"
    fi

    [ -z "$TOKEN" ] && TOKEN="${AIKIDO_TOKEN:-}"

    if [ -z "$TOKEN" ]; then
        if config_has_token "$ENDPOINT_CONFIG"; then
            info "Already enrolled. Keeping the existing token."
        else
            error "Token is required. Pass it with --token <TOKEN> or set AIKIDO_TOKEN."
        fi
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
        PKG_FILE=$(mktemp "/tmp/NoonSecurity.XXXXXX.${ASSET##*.}")
        PKG_FILE_OWNED=1
        trap cleanup EXIT

        info "Downloading Noon Device Protection..."
        download "${BASE_URL}/${ASSET}" "$PKG_FILE"
        chmod 644 "$PKG_FILE"

        info "Verifying checksum..."
        verify_checksum "$PKG_FILE" "$EXPECTED_SHA256"
    fi

    # 4. Install the package
    info "Installing Noon Device Protection..."
    if [ "$PKG_TYPE" = "deb" ]; then
        install_deb
    else
        install_rpm
    fi

    info "Noon Device Protection installed successfully!"
}

main "$@"
