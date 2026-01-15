set -gx PATH $PATH $HOME/.safe-chain/bin

function npx
    wrapSafeChainCommand "npx" $argv
end

function yarn
    wrapSafeChainCommand "yarn" $argv
end

function pnpm
    wrapSafeChainCommand "pnpm" $argv
end

function pnpx
    wrapSafeChainCommand "pnpx" $argv
end

function bun
    wrapSafeChainCommand "bun" $argv
end

function bunx
    wrapSafeChainCommand "bunx" $argv
end

function npm
    # If args is just -v or --version and nothing else, just run the `npm -v` command
    # This is because nvm uses this to check the version of npm
    set argc (count $argv)
    if test $argc -eq 1
        switch $argv[1]
            case "-v" "--version"
                command npm $argv
                return
        end
    end

    wrapSafeChainCommand "npm" $argv
end

function pip
    wrapSafeChainCommand "pip" $argv
end

function pip3
    wrapSafeChainCommand "pip3" $argv
end

function uv
    wrapSafeChainCommand "uv" $argv
end

function poetry
    wrapSafeChainCommand "poetry" $argv
end

# `python -m pip`, `python -m pip3`.
function python
    wrapSafeChainCommand "python" $argv
end

# `python3 -m pip`, `python3 -m pip3'.
function python3
    wrapSafeChainCommand "python3" $argv
end

function pipx
    wrapSafeChainCommand "pipx" $argv
end

function printSafeChainWarning
    set original_cmd $argv[1]

    # Fish equivalent of ANSI color codes: yellow background, black text for "Warning:"
    set_color -b yellow black
    printf "Warning:"
    set_color normal
    printf " safe-chain is not available to protect you from installing malware. %s will run without it.\n" $original_cmd

    # Cyan text for the install command
    printf "Install safe-chain by using "
    set_color cyan
    printf "npm install -g @aikidosec/safe-chain"
    set_color normal
    printf ".\n"
end

function wrapSafeChainCommand
    set original_cmd $argv[1]
    set cmd_args $argv[2..-1]

    if not type -fq $original_cmd
       # If the original command is not available, don't try to wrap it: invoke
       # it transparently, so the shell can report errors as if this wrapper
       # didn't exist. fish always adds extra debug information when executing
       # missing commands from within a function, so after the "command not
       # found" handler, there will be information about how the
       # wrapSafeChainCommand function errored out. To avoid users assuming this
       # is a safe-chain bug, display an explicit error message afterwards.
       command $original_cmd $cmd_args
       set oldstatus $status
       echo "safe-chain tried to run $original_cmd but it doesn't seem to be installed in your \$PATH." >&2
       return $oldstatus
    end

    if type -q safe-chain
        # If the safe-chain command is available, just run it with the provided arguments
        safe-chain $original_cmd $cmd_args
    else
        # If the safe-chain command is not available, print a warning and run the original command
        printSafeChainWarning $original_cmd
        command $original_cmd $cmd_args
    end
end
