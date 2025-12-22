# Use cross-platform path separator (: on Unix, ; on Windows)
# $IsWindows is only available in PowerShell Core 6.0+. If it doesn't exist, assume Windows PowerShell
$isWindowsPlatform = if (Test-Path variable:IsWindows) { $IsWindows } else { $true }
$pathSeparator = if ($isWindowsPlatform) { ';' } else { ':' }
$safeChainBin = Join-Path (Join-Path $HOME '.safe-chain') 'bin'
$env:PATH = "$env:PATH$pathSeparator$safeChainBin"

function npx {
    Invoke-WrappedCommand "npx" $args
}

function yarn {
    Invoke-WrappedCommand "yarn" $args
}

function pnpm {
    Invoke-WrappedCommand "pnpm" $args
}

function pnpx {
    Invoke-WrappedCommand "pnpx" $args
}

function bun {
    Invoke-WrappedCommand "bun" $args
}

function bunx {
    Invoke-WrappedCommand "bunx" $args
}

function npm {
    # If args is just -v or --version and nothing else, just run the npm version command
    # This is because nvm uses this to check the version of npm
    if (($args.Length -eq 1) -and (($args[0] -eq "-v") -or ($args[0] -eq "--version"))) {
        Invoke-RealCommand "npm" $args
        return
    }

    Invoke-WrappedCommand "npm" $args
}

function pip {
    Invoke-WrappedCommand "pip" $args
}

function pip3 {
    Invoke-WrappedCommand "pip3" $args
}

function uv {
    Invoke-WrappedCommand "uv" $args
}

function poetry {
    Invoke-WrappedCommand "poetry" $args
}

# `python -m pip`, `python -m pip3`.
function python {
    Invoke-WrappedCommand 'python' $args
}

# `python3 -m pip`, `python3 -m pip3'.
function python3 {
    Invoke-WrappedCommand 'python3' $args
}

function pipx {
    Invoke-WrappedCommand "pipx" $args
}

function Write-SafeChainWarning {
    param([string]$Command)
    
    # PowerShell equivalent of ANSI color codes: yellow background, black text for "Warning:"
    Write-Host "Warning:" -BackgroundColor Yellow -ForegroundColor Black -NoNewline
    Write-Host " safe-chain is not available to protect you from installing malware. $Command will run without it."
    
    # Cyan text for the install command
    Write-Host "Install safe-chain by using " -NoNewline
    Write-Host "npm install -g @aikidosec/safe-chain" -ForegroundColor Cyan -NoNewline
    Write-Host "."
}

function Test-CommandAvailable {
    param([string]$Command)
    
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Invoke-RealCommand {
    param(
        [string]$Command,
        [string[]]$Arguments
    )
    
    # Find the real executable to avoid calling our wrapped functions
    $realCommand = Get-Command -Name $Command -CommandType Application | Select-Object -First 1
    if ($realCommand) {
        & $realCommand.Source @Arguments
    }
}

function Invoke-WrappedCommand {
    param(
        [string]$OriginalCmd,
        [string[]]$Arguments
    )

    if (Test-CommandAvailable "safe-chain") {
        & safe-chain $OriginalCmd @Arguments
    }
    else {
        Write-SafeChainWarning $OriginalCmd
        Invoke-RealCommand $OriginalCmd $Arguments
    }
}
