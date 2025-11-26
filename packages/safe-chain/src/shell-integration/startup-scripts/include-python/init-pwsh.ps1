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
        [string]$AikidoCmd,
        [string[]]$Arguments
    )

    if (Test-CommandAvailable $AikidoCmd) {
        & $AikidoCmd @Arguments
    }
    else {
        Write-SafeChainWarning $OriginalCmd
        Invoke-RealCommand $OriginalCmd $Arguments
    }
}

function npx {
    Invoke-WrappedCommand "npx" "aikido-npx" $args
}

function yarn {
    Invoke-WrappedCommand "yarn" "aikido-yarn" $args
}

function pnpm {
    Invoke-WrappedCommand "pnpm" "aikido-pnpm" $args
}

function pnpx {
    Invoke-WrappedCommand "pnpx" "aikido-pnpx" $args
}

function bun {
    Invoke-WrappedCommand "bun" "aikido-bun" $args
}

function bunx {
    Invoke-WrappedCommand "bunx" "aikido-bunx" $args
}

function npm {
    # If args is just -v or --version and nothing else, just run the npm version command
    # This is because nvm uses this to check the version of npm
    if (($args.Length -eq 1) -and (($args[0] -eq "-v") -or ($args[0] -eq "--version"))) {
        Invoke-RealCommand "npm" $args
        return
    }
    
    Invoke-WrappedCommand "npm" "aikido-npm" $args
}

function pip {
    Invoke-WrappedCommand "pip" "aikido-pip" $args
}

function pip3 {
    Invoke-WrappedCommand "pip3" "aikido-pip3" $args
}

function uv {
    Invoke-WrappedCommand "uv" "aikido-uv" $args
}

# `python -m pip`, `python -m pip3`.
function python {
    Invoke-WrappedCommand 'python' 'aikido-python' $args
}

# `python3 -m pip`, `python3 -m pip3'.
function python3 {
    Invoke-WrappedCommand 'python3' 'aikido-python3' $args
}

