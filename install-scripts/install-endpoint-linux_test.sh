#!/bin/sh
# Exercises detect_package_type without running the installer.
# The real script calls main, and it reads /etc/os-release, so this copy
# drops that call and points the read at a temp file.

set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
src="$root/install-scripts/install-endpoint-linux.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

os_release="$tmp/os-release"
sed "/^main /d; s|/etc/os-release|$os_release|g" "$src" > "$tmp/installer.sh"

check() {
    name=$1
    body=$2
    want_status=$3
    want_el=$4
    want_msg=$5

    printf '%s\n' "$body" > "$os_release"
    set +e
    (
        # shellcheck disable=SC1091
        . "$tmp/installer.sh"
        detect_package_type
        printf '%s %s\n' "$PKG_TYPE" "$EL_VERSION"
    ) >"$tmp/out" 2>"$tmp/err"
    status=$?
    set -e
    out=$(cat "$tmp/out")

    if [ "$status" != "$want_status" ]; then
        printf 'FAIL %s: status %s, want %s\n%s\n' "$name" "$status" "$want_status" "$(cat "$tmp/err")" >&2
        exit 1
    fi
    if [ "$want_status" = "0" ]; then
        if [ "$out" != "rpm $want_el" ]; then
            printf 'FAIL %s: got %s, want rpm %s\n' "$name" "$out" "$want_el" >&2
            exit 1
        fi
    elif ! grep -F -q "$want_msg" "$tmp/err"; then
        printf 'FAIL %s: stderr missing %s\n%s\n' "$name" "$want_msg" "$(cat "$tmp/err")" >&2
        exit 1
    fi
}

check "fedora 44" "ID=fedora
VERSION_ID=44" 0 el10 ""

check "fedora 45" "ID=fedora
VERSION_ID=45" 1 "" "Only Fedora 44 is supported."

check "fedora bare" "ID=fedora" 1 "" "Fedora unknown"

check "rhel 9" "ID=rhel
VERSION_ID=9.4" 0 el9 ""

check "rhel 8" "ID=rhel
VERSION_ID=8.10" 1 "" "Only Enterprise Linux 9 and 10 are supported."

printf 'ok\n'
