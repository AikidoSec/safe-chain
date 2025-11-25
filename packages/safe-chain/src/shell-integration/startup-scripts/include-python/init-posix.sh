
function printSafeChainWarning() {
  # \033[43;30m is used to set the background color to yellow and text color to black
  # \033[0m is used to reset the text formatting
  printf "\033[43;30mWarning:\033[0m safe-chain is not available to protect you from installing malware. %s will run without it.\n" "$1"
  # \033[36m is used to set the text color to cyan
  printf "Install safe-chain by using \033[36mnpm install -g @aikidosec/safe-chain\033[0m.\n"
}

function wrapSafeChainCommand() {
  local original_cmd="$1"
  local aikido_cmd="$2"

  # Remove the first 2 arguments (original_cmd and aikido_cmd) from $@
  # so that "$@" now contains only the arguments passed to the original command
  shift 2

  if command -v "$aikido_cmd" > /dev/null 2>&1; then
    # If the aikido command is available, just run it with the provided arguments
    "$aikido_cmd" "$@"
  else
    # If the aikido command is not available, print a warning and run the original command
    printSafeChainWarning "$original_cmd"

    command "$original_cmd" "$@"
  fi
}

function npx() {
  wrapSafeChainCommand "npx" "aikido-npx" "$@"
}

function yarn() {
  wrapSafeChainCommand "yarn" "aikido-yarn" "$@"
}

function pnpm() {
  wrapSafeChainCommand "pnpm" "aikido-pnpm" "$@"
}

function pnpx() {
  wrapSafeChainCommand "pnpx" "aikido-pnpx" "$@"
}

function bun() {
  wrapSafeChainCommand "bun" "aikido-bun" "$@"
}

function bunx() {
  wrapSafeChainCommand "bunx" "aikido-bunx" "$@"
}

function npm() {
  if [[ "$1" == "-v" || "$1" == "--version" ]] && [[ $# -eq 1 ]]; then
    # If args is just -v or --version and nothing else, just run the npm version command
    # This is because nvm uses this to check the version of npm
    command npm "$@"
    return
  fi

  wrapSafeChainCommand "npm" "aikido-npm" "$@"
}

function pip() {
  wrapSafeChainCommand "pip" "aikido-pip" "$@"
}

function pip3() {
  wrapSafeChainCommand "pip3" "aikido-pip3" "$@"
}

function uv() {
  wrapSafeChainCommand "uv" "aikido-uv" "$@"
}

# `python -m pip`, `python -m pip3`.
function python() {
  wrapSafeChainCommand "python" "aikido-python" "$@"
}

# `python3 -m pip`, `python3 -m pip3'.
function python3() {
  wrapSafeChainCommand "python3" "aikido-python3" "$@"
}
