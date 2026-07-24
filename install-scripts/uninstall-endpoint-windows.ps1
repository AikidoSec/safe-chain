# Uninstalls Aikido Endpoint Protection endpoint on Windows
#
# Usage: iex "& { $(iwr '<url>' -UseBasicParsing) } [-debug]"

param(
    [switch]$debug
)

# Configuration
$AppName = "Aikido Endpoint Protection"

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
    Write-Info "Looking for Aikido Endpoint Protection installation..."
    $app = Get-WmiObject -Class Win32_Product -Filter "Name='$AppName'"

    if (-not $app) {
        Write-Error-Custom "Aikido Endpoint Protection does not appear to be installed."
    }

    $productCode = $app.IdentifyingNumber
    $logFile = Join-Path $env:TEMP "AikidoEndpoint-$([System.Guid]::NewGuid().ToString('N')).log"

    try {
        Write-Info "Uninstalling Aikido Endpoint Protection..."
        $msiArgs = @("/x", $productCode, "/qn", "/norestart")
        if ($debug) {
            Write-Info "Debug logging enabled. MSI log: $logFile"
            $msiArgs += @("/L*V", "`"$logFile`"")
        }
        $process = Start-Process -FilePath "msiexec" -ArgumentList $msiArgs -Wait -PassThru

        if ($debug) {
            Write-Info "MSI uninstaller log output:"
            if (Test-Path $logFile) {
                Get-Content -Path $logFile | Write-Host
            }
            else {
                Write-Host "[WARN] No log file was produced at $logFile" -ForegroundColor Yellow
            }
        }

        if ($process.ExitCode -ne 0) {
            Write-Error-Custom "Uninstall failed (exit code: $($process.ExitCode))."
        }

        Write-Info "Aikido Endpoint Protection uninstalled successfully!"
    }
    finally {
        # Cleanup
        if (Test-Path $logFile) {
            Remove-Item -Path $logFile -Force -ErrorAction SilentlyContinue
        }
    }
}

# Run uninstallation
try {
    Uninstall-Endpoint
}
catch {
    Write-Error-Custom "Uninstallation failed: $_"
}
