
function printSafeChainWarning() {
  # \033[43;30m is used to set the background color to yellow and text color to black
  # \033[0m is used to reset the text formatting
  printf "\033[43;30mWarning:\033[0m safe-chain is not available to protect you from installing malware. %s will run without it.\n" "$1" >&2
  # \033[36m is used to set the text color to cyan
  printf "Install safe-chain by using \033[36mnpm install -g @aikidosec/safe-chain\033[0m.\n" >&2
}

function getMalwareAction() {
  # Parse --safe-chain-malware-action flag from arguments
  local action=""
  for arg in "$@"; do
    if [[ "$arg" =~ ^--safe-chain-malware-action=(.+)$ ]]; then
      action="${BASH_REMATCH[1]}"
    fi
  done

  # Default to block if not specified
  if [[ -z "$action" ]]; then
    echo "block"
  else
    echo "$action"
  fi
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
    # If the aikido command is not available, handle based on --safe-chain-malware-action flag
    printSafeChainWarning "$original_cmd"

    local action=$(getMalwareAction "$@")

    case "$action" in
      prompt)
        # Ask user if they want to continue
        printf "Do you want to continue without safe-chain protection? [y/N] " >&2
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
          command "$original_cmd" "$@"
        else
          printf "Aborted.\n" >&2
          return 1
        fi
        ;;
      block|*)
        # Block by default (safest option)
        printf "Refusing to execute %s without safe-chain protection.\n" "$original_cmd" >&2
        printf "To continue anyway, add: \033[36m--safe-chain-malware-action=prompt\033[0m\n" >&2
        return 1
        ;;
    esac
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
