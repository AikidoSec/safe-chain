# Uninstalls safe-chain from Windows
#
# Usage with "iex (iwr {url} -UseBasicParsing)" --> See README.md

# Use HOME on Unix, USERPROFILE on Windows (PowerShell Core is cross-platform)
$HomeDir = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }

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

function Get-InstallDirFromBinaryPath {
    param([string]$BinaryPath)

    if ([string]::IsNullOrWhiteSpace($BinaryPath)) {
        return $null
    }

    try {
        $resolvedPath = (Resolve-Path -LiteralPath $BinaryPath -ErrorAction Stop).Path
    }
    catch {
        $resolvedPath = [System.IO.Path]::GetFullPath($BinaryPath)
    }

    $fileName = [System.IO.Path]::GetFileName($resolvedPath)
    if (($fileName -ne "safe-chain") -and ($fileName -ne "safe-chain.exe")) {
        return $null
    }

    if ($resolvedPath -match '\.(js|cjs|mjs|cmd|ps1)$') {
        return $null
    }

    $binDir = Split-Path -Parent $resolvedPath
    if ((Split-Path -Leaf $binDir) -ne "bin") {
        return $null
    }

    return (Split-Path -Parent $binDir)
}

function Get-SafeChainCommand {
    return Get-Command safe-chain -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-ReportedInstallDir {
    $command = Get-SafeChainCommand
    if (-not $command) {
        return $null
    }

    try {
        $reportedInstallDir = & safe-chain get-install-dir 2>$null | Select-Object -First 1
        if ($reportedInstallDir) {
            $reportedInstallDir = $reportedInstallDir.Trim()
        }
        if ($reportedInstallDir) {
            return $reportedInstallDir
        }
    }
    catch {
        return $null
    }

    return $null
}

function Get-SafeChainInstallDir {
    $reportedInstallDir = Get-ReportedInstallDir
    if ($reportedInstallDir) {
        return $reportedInstallDir
    }

    $command = Get-SafeChainCommand
    if ($command -and $command.Path) {
        $discoveredInstallDir = Get-InstallDirFromBinaryPath -BinaryPath $command.Path
        if ($discoveredInstallDir) {
            return $discoveredInstallDir
        }
    }

    return (Join-Path $HomeDir ".safe-chain")
}

function Find-SafeChainBinary {
    param([string]$DotSafeChain)

    $safeChainExe = Join-Path $DotSafeChain "bin/safe-chain.exe"
    $safeChainBin = Join-Path $DotSafeChain "bin/safe-chain"

    if (Test-Path $safeChainExe) {
        return $safeChainExe
    }

    if (Test-Path $safeChainBin) {
        return $safeChainBin
    }

    $command = Get-SafeChainCommand
    if ($command) {
        return $command.Source
    }

    return $null
}

function Invoke-SafeChainTeardown {
    param([string]$SafeChainPath)

    if (-not $SafeChainPath) {
        Write-Warn "safe-chain command not found. Proceeding with uninstallation."
        return
    }

    Write-Info "Running safe-chain teardown..."
    try {
        & $SafeChainPath teardown
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "safe-chain teardown encountered issues, continuing with uninstallation..."
        }
    }
    catch {
        Write-Warn "safe-chain teardown encountered issues: $_"
        Write-Warn "Continuing with uninstallation..."
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

# Main uninstallation
function Uninstall-SafeChain {
    Write-Info "Uninstalling safe-chain..."
    $DotSafeChain = Get-SafeChainInstallDir
    $safeChainPath = Find-SafeChainBinary -DotSafeChain $DotSafeChain
    Invoke-SafeChainTeardown -SafeChainPath $safeChainPath

    # Remove npm and Volta installations
    Remove-NpmInstallation
    Remove-VoltaInstallation

    # Remove .safe-chain directory
    if (Test-Path $DotSafeChain) {
        Write-Info "Removing installation directory: $DotSafeChain"
        try {
            Remove-Item -Path $DotSafeChain -Recurse -Force
            Write-Info "Successfully removed installation directory"
        }
        catch {
            Write-Error-Custom "Failed to remove $DotSafeChain : $_"
        }
    }
    else {
        Write-Info "Installation directory $DotSafeChain does not exist. Nothing to remove."
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
