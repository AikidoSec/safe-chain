# Downloads and installs safe-chain for Windows
# Usage: iex (iwr "https://raw.githubusercontent.com/AikidoSec/safe-chain/main/install-scripts/install-safe-chain.ps1" -UseBasicParsing)

param(
    [string]$Version
)

# Configuration
if (-not $Version) {
    $Version = if ($env:SAFE_CHAIN_VERSION) { $env:SAFE_CHAIN_VERSION } else { "v0.0.2-binaries-beta" }
}

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

# Main installation
function Install-SafeChain {
    Write-Info "Installing safe-chain $Version..."

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

    # Check if directory is in PATH
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -like "*$InstallDir*") {
        Write-Info "Installation directory is already in PATH"
    }
    else {
        Write-Warn "Installation directory is not in PATH"
        Write-Host ""
        Write-Warn "Would you like to add it to your PATH now? (Y/N)"
        $response = Read-Host

        if ($response -eq "Y" -or $response -eq "y") {
            try {
                $newPath = "$userPath;$InstallDir"
                [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
                Write-Info "Added to PATH. Please restart your terminal for changes to take effect."
            }
            catch {
                Write-Warn "Failed to add to PATH automatically: $_"
                Write-Warn "Please add the following directory to your PATH manually:"
                Write-Host "    $InstallDir"
            }
        }
        else {
            Write-Warn "Skipping PATH setup. Add the following directory to your PATH manually:"
            Write-Host ""
            Write-Host "    $InstallDir"
            Write-Host ""
        }
    }

    # Execute safe-chain setup
    Write-Info "Running safe-chain setup..."

    try {
        $env:Path = "$env:Path;$InstallDir"
        & $finalFile setup

        if ($LASTEXITCODE -eq 0) {
            Write-Info "✓ safe-chain installed and configured successfully!"
        }
        else {
            Write-Warn "safe-chain was installed but setup encountered issues."
            Write-Warn "You can run 'safe-chain setup' manually later."
        }
    }
    catch {
        Write-Warn "safe-chain was installed but setup encountered issues: $_"
        Write-Warn "You can run 'safe-chain setup' manually later."
    }

    Write-Info "Installation complete!"
}

# Run installation
try {
    Install-SafeChain
}
catch {
    Write-Error-Custom "Installation failed: $_"
}
