# Downloads and installs safe-chain for Windows
#
# Usage with "iex (iwr {url} -UseBasicParsing)" --> See README.md

param(
    [switch]$ci,
    [switch]$includepython,
    [string]$InstallDir
)

# Validates and normalizes the requested install directory.
# Rejects non-absolute, root, PATH-like, and traversal-containing paths.
function Test-InstallDir {
    param([string]$Dir)

    if ([string]::IsNullOrWhiteSpace($Dir)) {
        return @{ Ok = $true; Normalized = $null }
    }

    if (-not [System.IO.Path]::IsPathRooted($Dir)) {
        return @{ Ok = $false; Reason = "-InstallDir must be an absolute path, got: $Dir" }
    }

    if ($Dir.Contains([System.IO.Path]::PathSeparator)) {
        return @{ Ok = $false; Reason = "-InstallDir must not contain the PATH separator ($([System.IO.Path]::PathSeparator))" }
    }

    $inputSegments = $Dir.Split([char[]]@('\', '/'), [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($inputSegments -contains "..") {
        return @{ Ok = $false; Reason = "-InstallDir must not contain path traversal segments" }
    }

    $normalized = [System.IO.Path]::GetFullPath($Dir)
    $root = [System.IO.Path]::GetPathRoot($normalized)
    if ($normalized.TrimEnd('\', '/') -eq $root.TrimEnd('\', '/')) {
        return @{ Ok = $false; Reason = "-InstallDir cannot be a root or drive-root directory" }
    }

    return @{ Ok = $true; Normalized = $normalized }
}

$Version = $env:SAFE_CHAIN_VERSION  # Will be fetched from latest release if not set
$SafeChainBase = if ($InstallDir) { $InstallDir } else { Join-Path $HOME ".safe-chain" }

$installDirValidation = Test-InstallDir -Dir $SafeChainBase
if (-not $installDirValidation.Ok) {
    Write-Host "[ERROR] $($installDirValidation.Reason)" -ForegroundColor Red
    exit 1
}

$SafeChainBase = $installDirValidation.Normalized
$InstallDir = Join-Path $SafeChainBase "bin"
$RepoUrl = "https://github.com/AikidoSec/safe-chain"

# SHA256 checksums for release binaries.
# Empty in source; populated by the release pipeline.
# When empty (running from main), checksum verification is skipped.
# Non-Windows hashes are unused today (PS script is Windows-only) but baked in
# for future cross-platform support.
$SHA256_MACOS_X64 = ""
$SHA256_MACOS_ARM64 = ""
$SHA256_LINUX_X64 = ""
$SHA256_LINUX_ARM64 = ""
$SHA256_LINUXSTATIC_X64 = ""
$SHA256_LINUXSTATIC_ARM64 = ""
$SHA256_WIN_X64 = ""
$SHA256_WIN_ARM64 = ""

# Ensure TLS 1.2 is enabled for downloads
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Helper functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

# Get currently installed version of safe-chain
function Get-InstalledVersion {
    # Check if safe-chain command exists
    if (-not (Get-Command safe-chain -ErrorAction SilentlyContinue)) {
        return $null
    }

    try {
        # Execute safe-chain -v and capture output
        $output = & safe-chain -v 2>&1

        # Extract version from "Current safe-chain version: X.Y.Z" output
        if ($output -match "Current safe-chain version:\s*(.+)") {
            return $matches[1].Trim()
        }

        return $null
    }
    catch {
        return $null
    }
}

# Check if the requested version is already installed
function Test-VersionInstalled {
    param([string]$RequestedVersion)

    $installedVersion = Get-InstalledVersion

    if ([string]::IsNullOrWhiteSpace($installedVersion)) {
        return $false
    }

    # Strip leading 'v' from versions if present for comparison
    $requestedClean = $RequestedVersion -replace '^v', ''
    $installedClean = $installedVersion -replace '^v', ''

    return $requestedClean -eq $installedClean
}

# Fetch latest release version tag from GitHub
function Get-LatestVersion {
    try {
        $response = Invoke-RestMethod -Uri "https://api.github.com/repos/AikidoSec/safe-chain/releases/latest" -UseBasicParsing
        $latestVersion = $response.tag_name

        if ([string]::IsNullOrWhiteSpace($latestVersion)) {
            Write-Error-Custom "Failed to fetch latest version from GitHub API. Please set SAFE_CHAIN_VERSION environment variable."
        }

        return $latestVersion
    }
    catch {
        Write-Error-Custom "Failed to fetch latest version from GitHub API: $($_.Exception.Message). Please set SAFE_CHAIN_VERSION environment variable."
    }
}

# Detect architecture
function Get-Architecture {
    $arch = $env:PROCESSOR_ARCHITECTURE
    switch ($arch) {
        "AMD64" { return "x64" }
        "ARM64" { return "arm64" }
        default { Write-Error-Custom "Unsupported architecture: $arch" }
    }
}

# Emits the deprecation warning for SAFE_CHAIN_VERSION and prints the version-pinned install command.
# Returns immediately when no version was provided through the environment.
function Write-VersionDeprecationWarning {
    if ([string]::IsNullOrWhiteSpace($env:SAFE_CHAIN_VERSION)) {
        return
    }

    Write-Warn "SAFE_CHAIN_VERSION environment variable is deprecated."
    Write-Warn ""
    Write-Warn "Please use direct download URLs for version pinning instead:"
    Write-Warn ""
    if ($ci) {
        Write-Warn "  iex `"& { `$(iwr 'https://github.com/AikidoSec/safe-chain/releases/download/$env:SAFE_CHAIN_VERSION/install-safe-chain.ps1' -UseBasicParsing) } -ci`""
    } else {
        Write-Warn "  iex (iwr `"https://github.com/AikidoSec/safe-chain/releases/download/$env:SAFE_CHAIN_VERSION/install-safe-chain.ps1`" -UseBasicParsing)"
    }
    Write-Warn ""
}

# Builds the Windows release binary filename for the detected architecture.
# Centralizes binary name generation for the download step.
function Get-BinaryName {
    param([string]$Architecture)

    return "safe-chain-win-$Architecture.exe"
}

# Returns the expected SHA256 for the given OS+arch, or empty if not baked in.
function Get-ExpectedSha256 {
    param([string]$Os, [string]$Architecture)
    switch ("$Os-$Architecture") {
        "macos-x64"         { return $SHA256_MACOS_X64 }
        "macos-arm64"       { return $SHA256_MACOS_ARM64 }
        "linux-x64"         { return $SHA256_LINUX_X64 }
        "linux-arm64"       { return $SHA256_LINUX_ARM64 }
        "linuxstatic-x64"   { return $SHA256_LINUXSTATIC_X64 }
        "linuxstatic-arm64" { return $SHA256_LINUXSTATIC_ARM64 }
        "win-x64"           { return $SHA256_WIN_X64 }
        "win-arm64"         { return $SHA256_WIN_ARM64 }
        default             { return "" }
    }
}

function Test-Checksum {
    param([string]$File, [string]$Expected)

    if ([string]::IsNullOrWhiteSpace($Expected)) { return }

    $actual = (Get-FileHash -Path $File -Algorithm SHA256).Hash.ToLowerInvariant()
    $expectedLower = $Expected.ToLowerInvariant()

    if ($actual -ne $expectedLower) {
        Remove-Item -Path $File -Force -ErrorAction SilentlyContinue
        Write-Error-Custom "Checksum verification failed. Expected: $expectedLower, Got: $actual"
    }

    Write-Info "Checksum verified."
}

# Runs safe-chain setup or setup-ci after the binary is installed.
# Temporarily appends the install directory to PATH and downgrades setup failures to warnings.
function Invoke-SafeChainSetup {
    param(
        [string]$BinaryPath,
        [string]$InstallDirectory
    )

    $setupCmd = if ($ci) { "setup-ci" } else { "setup" }

    Write-Info "Running safe-chain $setupCmd..."
    try {
        $env:Path = "$env:Path;$InstallDirectory"
        & $BinaryPath $setupCmd

        if ($LASTEXITCODE -ne 0) {
            Write-Warn "safe-chain was installed but setup encountered issues."
            Write-Warn "You can run 'safe-chain $setupCmd' manually later."
        }
    }
    catch {
        Write-Warn "safe-chain was installed but setup encountered issues: $_"
        Write-Warn "You can run 'safe-chain $setupCmd' manually later."
    }
}

# Check and uninstall npm global package if present
function Remove-NpmInstallation {
    # Check if npm is available
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        return
    }

    # Check if safe-chain is installed as an npm global package
    npm list -g @aikidosec/safe-chain 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Detected npm global installation of @aikidosec/safe-chain"
        Write-Info "Uninstalling npm version before installing binary version..."

        npm uninstall -g @aikidosec/safe-chain 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Successfully uninstalled npm version"
        }
        else {
            Write-Warn "Failed to uninstall npm version automatically"
            Write-Warn "Please run: npm uninstall -g @aikidosec/safe-chain"
        }
    }
}

# Check and uninstall Volta-managed package if present
function Remove-VoltaInstallation {
    # Check if Volta is available
    if (-not (Get-Command volta -ErrorAction SilentlyContinue)) {
        return
    }

    # Volta manages global packages in its own directory
    # Check if safe-chain is installed via Volta
    volta list safe-chain 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Detected Volta installation of @aikidosec/safe-chain"
        Write-Info "Uninstalling Volta version before installing binary version..."

        volta uninstall @aikidosec/safe-chain 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Successfully uninstalled Volta version"
        }
        else {
            Write-Warn "Failed to uninstall Volta version automatically"
            Write-Warn "Please run: volta uninstall @aikidosec/safe-chain"
        }
    }
}

# Main installation
function Install-SafeChain {
    Write-VersionDeprecationWarning

    # Fetch latest version if VERSION is not set
    if ([string]::IsNullOrWhiteSpace($Version)) {
        Write-Info "Fetching latest release version..."
        $Version = Get-LatestVersion
    }

    # Check if the requested version is already installed
    if (Test-VersionInstalled -RequestedVersion $Version) {
        Write-Info "safe-chain $Version is already installed"
        return
    }

    # Build installation message
    $installMsg = "Installing safe-chain $Version"
    if ($ci) {
        $installMsg += " in ci"
    }
    if ($includepython) {
        Write-Warn "-includepython is deprecated and ignored. Python ecosystem is now included by default."
    }

    Write-Info $installMsg

    # Check for existing safe-chain installation through npm or volta
    Remove-NpmInstallation
    Remove-VoltaInstallation

    # Detect platform
    $arch = Get-Architecture
    $binaryName = Get-BinaryName -Architecture $arch

    Write-Info "Detected architecture: $arch"

    # Create installation directory
    if (-not (Test-Path $InstallDir)) {
        Write-Info "Creating installation directory: $InstallDir"
        try {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }
        catch {
            Write-Error-Custom "Failed to create directory $InstallDir : $_"
        }
    }

    # Download binary
    $downloadUrl = "$RepoUrl/releases/download/$Version/$binaryName"
    $tempFile = Join-Path $InstallDir $binaryName

    Write-Info "Downloading from: $downloadUrl"

    try {
        # Download with progress suppressed for cleaner output
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -UseBasicParsing
        $ProgressPreference = 'Continue'
    }
    catch {
        Write-Error-Custom "Failed to download from $downloadUrl : $_"
    }

    $expectedSha = Get-ExpectedSha256 -Os "win" -Architecture $arch
    Test-Checksum -File $tempFile -Expected $expectedSha

    # Rename to final location
    $finalFile = Join-Path $InstallDir "safe-chain.exe"
    try {
        # Remove existing file if present (Move-Item -Force doesn't overwrite)
        if (Test-Path $finalFile) {
            Remove-Item -Path $finalFile -Force
        }
        Move-Item -Path $tempFile -Destination $finalFile -Force
    }
    catch {
        Write-Error-Custom "Failed to move binary to $finalFile : $_"
    }

    Write-Info "Binary installed to: $finalFile"

    Invoke-SafeChainSetup -BinaryPath $finalFile -InstallDirectory $InstallDir
}

# Run installation
try {
    Install-SafeChain
}
catch {
    Write-Error-Custom "Installation failed: $_"
}
