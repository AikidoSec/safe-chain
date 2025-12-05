/**
 * @param {string[]} args
 * @param {...string} commandArgs
 * @returns {boolean}
 */
export function matchesCommand(args, ...commandArgs) {
  if (args.length < commandArgs.length) {
    return false;
  }

  for (var i = 0; i < commandArgs.length; i++) {
    if (args[i].toLowerCase() !== commandArgs[i].toLowerCase()) {
      return false;
    }
  }

  return true;
}
