# Uninstalls SafeChain Ultimate endpoint on Windows
#
# Usage: iex (iwr '<url>' -UseBasicParsing)

# Configuration
$AppName = "SafeChain Ultimate"

# Helper functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

# Check if running as Administrator
function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Main uninstallation
function Uninstall-Endpoint {
    # Check if we're running as Administrator
    if (-not (Test-Administrator)) {
        Write-Error-Custom "Administrator privileges required. Please run this script in an elevated terminal (Run as Administrator)."
    }

    # Find the installed product
    Write-Info "Looking for SafeChain Ultimate installation..."
    $app = Get-WmiObject -Class Win32_Product -Filter "Name='$AppName'"

    if (-not $app) {
        Write-Error-Custom "SafeChain Ultimate does not appear to be installed."
    }

    $productCode = $app.IdentifyingNumber

    Write-Info "Uninstalling SafeChain Ultimate..."
    $process = Start-Process -FilePath "msiexec" -ArgumentList "/x", $productCode, "/qn", "/norestart" -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Error-Custom "Uninstall failed (exit code: $($process.ExitCode))."
    }

    Write-Info "SafeChain Ultimate uninstalled successfully!"
}

# Run uninstallation
try {
    Uninstall-Endpoint
}
catch {
    Write-Error-Custom "Uninstallation failed: $_"
}
