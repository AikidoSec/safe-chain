# Downloads and installs safe-chain for Windows
# Usage: iex (iwr "https://raw.githubusercontent.com/AikidoSec/safe-chain/main/install-scripts/install-safe-chain.ps1" -UseBasicParsing)


$Version = "v0.0.4-binaries-beta"
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

# Main installation
function Install-SafeChain {
    Write-Info "Installing safe-chain $Version..."

    # Check for existing npm installation
    Remove-NpmInstallation

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
    $finalFile = Join-Path $InstallDir "safe-chain.exe"

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
    try {
        Move-Item -Path $tempFile -Destination $finalFile -Force
    }
    catch {
        Write-Error-Custom "Failed to move binary to $finalFile : $_"
    }

    Write-Info "Binary installed to: $finalFile"

    # Execute safe-chain setup
    try {
        $env:Path = "$env:Path;$InstallDir"
        & $finalFile setup

        if ($LASTEXITCODE -ne 0) {
            Write-Warn "safe-chain was installed but setup encountered issues."
            Write-Warn "You can run 'safe-chain setup' manually later."
        }
    }
    catch {
        Write-Warn "safe-chain was installed but setup encountered issues: $_"
        Write-Warn "You can run 'safe-chain setup' manually later."
    }
}

# Run installation
try {
    Install-SafeChain
}
catch {
    Write-Error-Custom "Installation failed: $_"
}
