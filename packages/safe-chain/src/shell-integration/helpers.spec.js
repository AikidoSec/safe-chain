import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "path";

describe("removeLinesMatchingPatternTests", () => {
  let testFile;

  beforeEach(() => {
    // Create temporary test file
    testFile = path.join(tmpdir(), `test-helpers-${Date.now()}.txt`);

    // Mock the os module to override EOL
    mock.module("node:os", {
      namedExports: {
        EOL: "\r\n", // Simulate Windows line endings
        tmpdir: tmpdir,
        platform: () => "linux",
      },
    });
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }

    // Reset mocks
    mock.reset();
  });

  it("should handle mixed line endings without wiping entire file", async () => {
    // Import helpers after setting up the mock
    const { removeLinesMatchingPattern } = await import("./helpers.js");

    // Create a file with Unix line endings but os.EOL expects Windows
    const fileContent = [
      "# keep this line",
      "alias npm='remove-this'",
      "# keep this line too",
      "alias yarn='remove-this-too'",
      "# final line to keep",
    ].join("\n"); // File has Unix line endings

    fs.writeFileSync(testFile, fileContent, "utf-8");

    // Try to remove lines containing 'alias'
    const pattern = /alias.*=/;
    removeLinesMatchingPattern(testFile, pattern);

    const result = fs.readFileSync(testFile, "utf-8");

    // This test will fail because the function splits on '\r\n' but file uses '\n'
    // So it treats the entire content as one line and if any part matches, removes everything
    assert.ok(
      result.includes("keep this line"),
      "Should preserve non-matching lines"
    );
    assert.ok(
      result.includes("final line to keep"),
      "Should preserve final line"
    );
  });

  it("should handle mixed line endings with short matching content", async () => {
    // Import helpers after setting up the mock
    const { removeLinesMatchingPattern } = await import("./helpers.js");

    // Create a file with Unix line endings, but make the entire content short
    // to bypass the maxLineLength protection
    const fileContent = [
      "# keep1",
      "alias x=y", // Short alias line that should be removed
      "# keep2",
    ].join("\n"); // File has Unix line endings, total length < 100 chars

    fs.writeFileSync(testFile, fileContent, "utf-8");

    // Try to remove lines containing 'alias'
    const pattern = /alias/;
    removeLinesMatchingPattern(testFile, pattern);

    const result = fs.readFileSync(testFile, "utf-8");

    // This should now be protected by the newline detection
    assert.ok(result.includes("keep1"), "Should preserve first line");
    assert.ok(result.includes("keep2"), "Should preserve third line");
  });

  it("should handle Unicode line separators that bypass newline detection", async () => {
    // Import helpers after setting up the mock
    const { removeLinesMatchingPattern } = await import("./helpers.js");

    // Use Unicode line separator (U+2028) and paragraph separator (U+2029)
    // These are considered line breaks but aren't \n or \r
    const fileContent = ["keep this", "alias test=value", "keep that"].join(
      "\u2028"
    ); // Unicode line separator

    fs.writeFileSync(testFile, fileContent, "utf-8");

    // Try to remove lines containing 'alias'
    const pattern = /alias/;
    removeLinesMatchingPattern(testFile, pattern);

    const result = fs.readFileSync(testFile, "utf-8");

    // This could still wipe everything if split() treats it as one line
    // but the content doesn't contain \n or \r so passes the newline check
    assert.ok(result.includes("keep this"), "Should preserve first part");
    assert.ok(result.includes("keep that"), "Should preserve last part");
  });

  it("should handle Windows CRLF line endings without creating empty lines", async () => {
    // Import helpers after setting up the mock
    const { removeLinesMatchingPattern } = await import("./helpers.js");

    // Create a file with Windows CRLF line endings
    const fileContent = [
      "# comment 1",
      "alias npm='aikido-npm'",
      "# comment 2",
      "export PATH=$PATH:/usr/local/bin",
      "",
      "# comment 3",
    ].join("\r\n"); // Windows line endings

    fs.writeFileSync(testFile, fileContent, "utf-8");

    // Try to remove lines containing 'alias'
    const pattern = /alias/;
    removeLinesMatchingPattern(testFile, pattern, "\r\n");

    const result = fs.readFileSync(testFile, "utf-8");

    // Should preserve non-matching lines without adding empty lines
    assert.ok(result.includes("# comment 1"), "Should preserve first comment");
    assert.ok(result.includes("# comment 2"), "Should preserve second comment");
    assert.ok(result.includes("# comment 3"), "Should preserve third comment");
    assert.ok(result.includes("export PATH"), "Should preserve export line");
    assert.ok(!result.includes("alias npm"), "Should remove alias line");

    // The key test: when we split on \r\n, we should get exactly 4 lines
    // Bug: if split(/[\r\n]/) was used, it creates empty lines between each real line
    // because \r\n becomes two separators, resulting in: ["# comment 1", "", "# comment 2", "", "export...", "", "# comment 3", ""]
    const resultLines = result.split("\r\n");
    assert.strictEqual(resultLines.length, 5, "Should have exactly 5 lines");
  });

  it("should not remove empty lines on unix line endings", async () => {
    // Import helpers after setting up the mock
    const { removeLinesMatchingPattern } = await import("./helpers.js");

    // Create a file with Unix line endings and empty lines
    const fileContent = [
      "# comment 1",
      "alias npm='aikido-npm'",
      "# comment 2",
      "export PATH=$PATH:/usr/local/bin",
      "",
      "# comment 3",
    ].join("\n"); // Unix line endings

    fs.writeFileSync(testFile, fileContent, "utf-8");

    // Try to remove lines containing 'alias'
    const pattern = /alias/;
    removeLinesMatchingPattern(testFile, pattern, "\n");

    const result = fs.readFileSync(testFile, "utf-8");

    // Should preserve non-matching lines including empty lines
    assert.ok(result.includes("# comment 1"), "Should preserve first comment");
    assert.ok(result.includes("# comment 2"), "Should preserve second comment");
    assert.ok(result.includes("# comment 3"), "Should preserve third comment");
    assert.ok(result.includes("export PATH"), "Should preserve export line");
    assert.ok(!result.includes("alias npm"), "Should remove alias line");

    const resultLines = result.split("\n");
    assert.strictEqual(resultLines.length, 5, "Should have exactly 5 lines");
  });
});
