# Downloads and installs safe-chain for Windows
#
# Usage with "iex (iwr {url} -UseBasicParsing)" --> See README.md

param(
    [switch]$ci
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
    # Fetch latest version if VERSION is not set
    if ([string]::IsNullOrWhiteSpace($Version)) {
        Write-Info "Fetching latest release version..."
        $Version = Get-LatestVersion
    }

    # Build installation message
    $installMsg = "Installing safe-chain $Version"
    if ($ci) {
        $installMsg += " in ci"
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
