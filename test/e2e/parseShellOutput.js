const escapeChar = "\u001b";
const startMarker = `${escapeChar}[?2004l`;
const endMarker = `${escapeChar}[?2004h`;

/* eslint-disable no-control-regex */
// This module removes control characters and escape sequences from shell output.
// So it is allowed to use control characters in the regex patterns here.

export function parseShellOutput(rawData, sentinel) {
  const stringData = rawData.join("");

  let output = getCommandOutput(stringData, sentinel);
  output = processBackspaces(output);
  output = processEraseCommands(output);
  output = removeOscSequences(output);
  output = removeAnsiSgrSequences(output);
  output = removeRemainingEscapeSequences(output);

  return output.trim();
}

function getCommandOutput(data, sentinel) {
  const sentinelIndex = sentinel ? data.indexOf(sentinel) : -1;
  const scope = sentinelIndex === -1 ? data : data.slice(0, sentinelIndex);
  const accepted = [];

  for (
    let index = scope.indexOf(startMarker);
    index !== -1;
    index = scope.indexOf(startMarker, index + startMarker.length)
  ) {
    accepted.push(index + startMarker.length);
  }

  if (accepted.length === 0) {
    return data;
  }

  // The shell echoes every line back before accepting it, so output only starts
  // at the last line it accepted. That is the line echoing the sentinel, or the
  // command's own last line when the command timed out before we sent it. Taking
  // the last prompt as the end keeps output that a mid-command prompt redraw
  // would otherwise cut short.
  const skip = sentinelIndex === -1 ? 1 : 2;
  const from = accepted[Math.max(0, accepted.length - skip)];
  const to = scope.lastIndexOf(endMarker);

  return to > from ? scope.slice(from, to) : scope.slice(from);
}

function processBackspaces(data) {
  const result = [];

  for (let i = 0; i < data.length; i++) {
    const char = data[i];

    if (char === "\b") {
      // Backspace: remove the previous character if it exists
      if (result.length > 0) {
        result.pop();
      }
    } else {
      result.push(char);
    }
  }

  return result.join("");
}

function removeOscSequences(data) {
  return data.replace(/\u001b\][0-9]*;[^\u0007\u001b]*(\u0007|\u001b\\)/g, "");
}

function removeAnsiSgrSequences(data) {
  return data.replace(/\u001b\[[0-9;]*m/g, "");
}

function processEraseCommands(data) {
  const lines = data.split("\n");
  const result = [];

  for (let line of lines) {
    // Process erase in line commands
    line = line.replace(/\u001b\[K/g, ""); // Erase to end of line
    line = line.replace(/\u001b\[0K/g, ""); // Erase to end of line
    line = line.replace(/\u001b\[1K/g, ""); // Erase from start of line to cursor
    line = line.replace(/\u001b\[2K/g, ""); // Erase entire line - remove the whole line

    // Skip lines that were completely erased
    if (line.includes("\u001b[2K")) {
      continue;
    }

    result.push(line);
  }

  // Process erase in display commands
  let output = result.join("\n");
  output = output.replace(/\u001b\[J/g, ""); // Erase to end of display
  output = output.replace(/\u001b\[0J/g, ""); // Erase to end of display
  output = output.replace(/\u001b\[1J/g, ""); // Erase from start to cursor
  output = output.replace(/\u001b\[2J/g, ""); // Erase entire display

  return output;
}

function removeRemainingEscapeSequences(data) {
  // Remove mode setting sequences like \u001b[?1h, \u001b[?1l
  data = data.replace(/\u001b\[\?[0-9]+[hl]/g, "");

  // Remove any other CSI sequences we haven't handled
  data = data.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");

  // Remove incomplete or malformed escape sequences
  data = data.replace(/\u001b[^\u001b]*/g, "");

  return data;
}
