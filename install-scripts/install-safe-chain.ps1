# Downloads and installs safe-chain for Windows
#
# Usage with "iex (iwr {url} -UseBasicParsing)" --> See README.md

param(
    [switch]$ci,
    [switch]$includepython
)

$Version = $env:SAFE_CHAIN_VERSION  # Will be fetched from latest release if not set
$InstallDir = Join-Path $env:USERPROFILE ".safe-chain\bin"
$RepoUrl = "https://github.com/AikidoSec/safe-chain"

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
    # Show deprecation warning if SAFE_CHAIN_VERSION is set
    if (-not [string]::IsNullOrWhiteSpace($env:SAFE_CHAIN_VERSION)) {
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
    $binaryName = "safe-chain-win-$arch.exe"

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

    # Build setup command based on parameters
    $setupCmd = if ($ci) { "setup-ci" } else { "setup" }
    $setupArgs = @()

    # Execute safe-chain setup
    Write-Info "Running safe-chain $setupCmd $(if ($setupArgs) { $setupArgs -join ' ' })..."
    try {
        $env:Path = "$env:Path;$InstallDir"

        if ($setupArgs) {
            & $finalFile $setupCmd $setupArgs
        }
        else {
            & $finalFile $setupCmd
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Warn "safe-chain was installed but setup encountered issues."
            Write-Warn "You can run 'safe-chain $setupCmd $(if ($setupArgs) { $setupArgs -join ' ' })' manually later."
        }
    }
    catch {
        Write-Warn "safe-chain was installed but setup encountered issues: $_"
        Write-Warn "You can run 'safe-chain $setupCmd $(if ($setupArgs) { $setupArgs -join ' ' })' manually later."
    }
}

# Run installation
try {
    Install-SafeChain
}
catch {
    Write-Error-Custom "Installation failed: $_"
}
