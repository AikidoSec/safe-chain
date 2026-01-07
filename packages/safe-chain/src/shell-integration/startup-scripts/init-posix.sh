export PATH="$PATH:$HOME/.safe-chain/bin"

function npx() {
  wrapSafeChainCommand "npx" "$@"
}

function yarn() {
  wrapSafeChainCommand "yarn" "$@"
}

function pnpm() {
  wrapSafeChainCommand "pnpm" "$@"
}

function pnpx() {
  wrapSafeChainCommand "pnpx" "$@"
}

function bun() {
  wrapSafeChainCommand "bun" "$@"
}

function bunx() {
  wrapSafeChainCommand "bunx" "$@"
}

function npm() {
  if [[ "$1" == "-v" || "$1" == "--version" ]] && [[ $# -eq 1 ]]; then
    # If args is just -v or --version and nothing else, just run the npm version command
    # This is because nvm uses this to check the version of npm
    command npm "$@"
    return
  fi

  wrapSafeChainCommand "npm" "$@"
}

function pip() {
  wrapSafeChainCommand "pip" "$@"
}

function pip3() {
  wrapSafeChainCommand "pip3" "$@"
}

function uv() {
  wrapSafeChainCommand "uv" "$@"
}

function poetry() {
  wrapSafeChainCommand "poetry" "$@"
}

# `python -m pip`, `python -m pip3`.
function python() {
  wrapSafeChainCommand "python" "$@"
}

# `python3 -m pip`, `python3 -m pip3'.
function python3() {
  wrapSafeChainCommand "python3" "$@"
}

function pipx() {
  wrapSafeChainCommand "pipx" "$@"
}

function printSafeChainWarning() {
  # \033[43;30m is used to set the background color to yellow and text color to black
  # \033[0m is used to reset the text formatting
  printf "\033[43;30mWarning:\033[0m safe-chain is not available to protect you from installing malware. %s will run without it.\n" "$1"
  # \033[36m is used to set the text color to cyan
  printf "Install safe-chain by using \033[36mnpm install -g @aikidosec/safe-chain\033[0m.\n"
}

function wrapSafeChainCommand() {
  local original_cmd="$1"

  if ! type -f "${original_cmd}" > /dev/null 2>&1; then
    # If the original command is not available, don't try to wrap it: invoke it
    # transparently, so the shell can report errors as if this wrapper didn't
    # exist.
    command $@
    return $?
  fi

  if command -v safe-chain > /dev/null 2>&1; then
    # If the aikido command is available, just run it with the provided arguments
    safe-chain "$@"
  else
    # If the aikido command is not available, print a warning and run the original command
    printSafeChainWarning "$original_cmd"

    command "$@"
  fi
}
