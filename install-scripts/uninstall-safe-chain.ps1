# Uninstalls safe-chain from Windows
#
# Usage with "iex (iwr {url} -UseBasicParsing)" --> See README.md

# Use HOME on Unix, USERPROFILE on Windows (PowerShell Core is cross-platform)
$HomeDir = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }
$InstallDir = Join-Path $HomeDir ".safe-chain/bin"

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

# Main uninstallation
function Uninstall-SafeChain {
    Write-Info "Uninstalling safe-chain..."

    # Run teardown if safe-chain is available
    # Check for both safe-chain.exe (Windows) and safe-chain (Unix) since PowerShell Core runs on all platforms
    $safeChainExe = Join-Path $InstallDir "safe-chain.exe"
    $safeChainBin = Join-Path $InstallDir "safe-chain"

    $safeChainPath = $null
    if (Test-Path $safeChainExe) {
        $safeChainPath = $safeChainExe
    }
    elseif (Test-Path $safeChainBin) {
        $safeChainPath = $safeChainBin
    }

    if ($safeChainPath) {
        Write-Info "Running safe-chain teardown..."
        try {
            & $safeChainPath teardown
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "safe-chain teardown encountered issues, continuing with uninstallation..."
            }
        }
        catch {
            Write-Warn "safe-chain teardown encountered issues: $_"
            Write-Warn "Continuing with uninstallation..."
        }
    }
    elseif (Get-Command safe-chain -ErrorAction SilentlyContinue) {
        Write-Info "Running safe-chain teardown..."
        try {
            safe-chain teardown
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "safe-chain teardown encountered issues, continuing with uninstallation..."
            }
        }
        catch {
            Write-Warn "safe-chain teardown encountered issues: $_"
            Write-Warn "Continuing with uninstallation..."
        }
    }
    else {
        Write-Warn "safe-chain command not found. Proceeding with uninstallation."
    }

    # Remove npm and Volta installations
    Remove-NpmInstallation
    Remove-VoltaInstallation

    # Remove installation directory
    if (Test-Path $InstallDir) {
        Write-Info "Removing installation directory: $InstallDir"
        try {
            Remove-Item -Path $InstallDir -Recurse -Force
            Write-Info "Successfully removed installation directory"
        }
        catch {
            Write-Error-Custom "Failed to remove $InstallDir : $_"
        }
    }
    else {
        Write-Info "Installation directory $InstallDir does not exist. Nothing to remove."
    }

    # Also try to remove the parent .safe-chain directory if it's empty
    $parentDir = Split-Path $InstallDir -Parent
    if (Test-Path $parentDir) {
        $items = Get-ChildItem -Path $parentDir -Force
        if ($items.Count -eq 0) {
            Write-Info "Removing empty parent directory: $parentDir"
            try {
                Remove-Item -Path $parentDir -Force
            }
            catch {
                Write-Warn "Could not remove empty parent directory: $_"
            }
        }
    }

    Write-Info "safe-chain has been uninstalled successfully!"
}

# Run uninstallation
try {
    Uninstall-SafeChain
}
catch {
    Write-Error-Custom "Uninstallation failed: $_"
}
