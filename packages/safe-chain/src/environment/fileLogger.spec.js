import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

let writtenData = [];
let mockStreamError = null;
let currentFormat = "json";

const mockWriteStream = {
    write: (data) => {
        writtenData.push(data);
        return true;
    },
    end: (cb) => {
        if (cb) cb();
    },
    on: (event, handler) => {
        if (event === "error" && mockStreamError) {
            handler(mockStreamError);
        }
    },
};

mock.module("fs", {
    namedExports: {
        existsSync: () => true,
        createWriteStream: () => mockWriteStream,
        mkdirSync: () => { },
        readFileSync: () => "",
        writeFileSync: () => { },
        appendFileSync: (_path, data) => {
            // closeFileLoggerSync writes the session-end entry via appendFileSync
            // (so it actually lands on process.exit). Mirror it into writtenData
            // so existing assertions about session-end content still apply.
            writtenData.push(data);
        },
    },
});

let currentVerbosity = "verbose";

mock.module("../config/settings.js", {
    namedExports: {
        LOG_FILE_FORMAT_PLAIN: "plain",
        LOG_FILE_FORMAT_JSON: "json",
        getLogFileFormat: () => currentFormat,
        LOGGING_SILENT: "silent",
        LOGGING_NORMAL: "normal",
        LOGGING_VERBOSE: "verbose",
        getLogFileVerbosity: () => currentVerbosity,
    },
});

const {
    initializeFileLogger,
    isFileLoggingActive,
    writeToLogFile,
    closeFileLogger,
    closeFileLoggerSync,
} = await import("./fileLogger.js");

function initAndReset() {
    initializeFileLogger("/tmp/test.log", () => { });
    writtenData = [];
}

describe("fileLogger - plain format", () => {
    beforeEach(() => {
        writtenData = [];
        mockStreamError = null;
        currentFormat = "plain";
        currentVerbosity = "verbose";
    });

    afterEach(() => {
        closeFileLoggerSync();
    });

    it("should not be active before initialization", () => {
        assert.strictEqual(isFileLoggingActive(), false);
    });

    it("should be active after initialization", () => {
        initializeFileLogger("/tmp/test.log", () => { });
        assert.strictEqual(isFileLoggingActive(), true);
    });

    it("should write a plain-text session start entry on init", () => {
        initializeFileLogger("/tmp/test.log", () => { });

        assert.strictEqual(writtenData.length, 1);
        assert.ok(writtenData[0].includes("[info]"));
        assert.ok(writtenData[0].includes("Log started, command:"));
    });

    it("should write plain-text log entries with timestamp and level", () => {
        initAndReset();

        writeToLogFile("warning", "something happened");

        assert.strictEqual(writtenData.length, 1);
        assert.ok(writtenData[0].includes("[warning]"));
        assert.ok(writtenData[0].includes("something happened"));
        assert.ok(writtenData[0].endsWith("\n"));
    });

    it("should write plain-text log entries for all levels", () => {
        initAndReset();

        writeToLogFile("info", "info msg");
        writeToLogFile("verbose", "verbose msg");
        writeToLogFile("error", "error msg");
        writeToLogFile("warning", "warning msg");

        assert.strictEqual(writtenData.length, 4);
        assert.ok(writtenData[0].includes("[info]"));
        assert.ok(writtenData[1].includes("[verbose]"));
        assert.ok(writtenData[2].includes("[error]"));
        assert.ok(writtenData[3].includes("[warning]"));
    });

    it("should preserve ANSI codes in messages", () => {
        initAndReset();

        writeToLogFile("info", "\x1b[31mred error\x1b[0m");

        assert.ok(writtenData[0].includes("\x1b[31m"));
        assert.ok(writtenData[0].includes("red error"));
    });

    it("should append params after the message in plain format", () => {
        initAndReset();

        writeToLogFile("info", "hello", "world", { k: "v" });

        assert.ok(writtenData[0].includes("hello"));
        assert.ok(writtenData[0].includes("world"));
        assert.ok(writtenData[0].includes('{"k":"v"}'));
    });

    it("should escape CR/LF in plain-format messages to prevent log injection", () => {
        initAndReset();

        writeToLogFile("info", "evil\n[ts] [info] forged", "param\rline");

        // Each call should produce exactly one line. A naive implementation
        // would emit two newline-separated lines and let the second masquerade
        // as an independent log entry.
        assert.strictEqual(writtenData.length, 1);
        const line = writtenData[0];
        assert.strictEqual((line.match(/\n/g) || []).length, 1);
        assert.ok(line.endsWith("\n"));
        assert.ok(line.includes("evil\\n[ts] [info] forged"));
        assert.ok(line.includes("param\\rline"));
    });

    it("should not be active after sync close", () => {
        initializeFileLogger("/tmp/test.log", () => { });
        assert.strictEqual(isFileLoggingActive(), true);

        closeFileLoggerSync();

        assert.strictEqual(isFileLoggingActive(), false);
    });

    it("should not be active after async close", async () => {
        initializeFileLogger("/tmp/test.log", () => { });
        assert.strictEqual(isFileLoggingActive(), true);

        await closeFileLogger();

        assert.strictEqual(isFileLoggingActive(), false);
    });

    it("should write a log-ended-with-command entry on async close", async () => {
        initAndReset();

        await closeFileLogger();

        assert.strictEqual(writtenData.length, 1);
        assert.ok(writtenData[0].includes("Log ended, command:"));
    });

    it("should write a log-ended-with-command entry on sync close", () => {
        initAndReset();

        closeFileLoggerSync();

        assert.strictEqual(writtenData.length, 1);
        assert.ok(writtenData[0].includes("Log ended, command:"));
    });

    it("should write the session-end entry via appendFileSync on sync close", () => {
        // stream.end() only queues a flush; on process.exit() in a signal /
        // crash handler the queued write is lost. The session-end entry has
        // to bypass the stream and write directly to disk synchronously.
        initAndReset();

        const streamWrites = [];
        const originalWrite = mockWriteStream.write;
        mockWriteStream.write = (data) => {
            streamWrites.push(data);
            return true;
        };

        try {
            closeFileLoggerSync();
        } finally {
            mockWriteStream.write = originalWrite;
        }

        assert.strictEqual(
            streamWrites.length,
            0,
            "session-end must not go through stream.write"
        );
        assert.strictEqual(writtenData.length, 1);
        assert.ok(writtenData[0].includes("Log ended, command:"));
    });

    it("should not write when not initialized", () => {
        writeToLogFile("info", "should be ignored");

        assert.strictEqual(writtenData.length, 0);
    });

    it("initialize should be idempotent", () => {
        initializeFileLogger("/tmp/test.log", () => { });
        const after_first = writtenData.length;

        initializeFileLogger("/tmp/test.log", () => { });

        assert.strictEqual(writtenData.length, after_first);
    });
});

describe("fileLogger - json format", () => {
    beforeEach(() => {
        writtenData = [];
        mockStreamError = null;
        currentFormat = "json";
        currentVerbosity = "verbose";
    });

    afterEach(() => {
        closeFileLoggerSync();
    });

    it("should write JSON session start entry on init", () => {
        initializeFileLogger("/tmp/test.log", () => { });

        assert.strictEqual(writtenData.length, 1);
        const entry = JSON.parse(writtenData[0]);
        assert.strictEqual(entry.level, "info");
        assert.ok(!("source" in entry));
        assert.ok(entry.message.includes("Log started, command:"));
        assert.ok(entry.timestamp);
        assert.ok(!("params" in entry));
    });

    it("should write structured JSON log entries", () => {
        initAndReset();

        writeToLogFile("warning", "something happened");

        assert.strictEqual(writtenData.length, 1);
        const entry = JSON.parse(writtenData[0]);
        assert.strictEqual(entry.level, "warning");
        assert.ok(!("source" in entry));
        assert.strictEqual(entry.message, "something happened");
        assert.ok(entry.timestamp);
        assert.ok(!("params" in entry));
    });

    it("should preserve ANSI codes in JSON message field", () => {
        initAndReset();

        writeToLogFile("error", "\x1b[31mred error\x1b[0m");

        const entry = JSON.parse(writtenData[0]);
        assert.strictEqual(entry.message, "\x1b[31mred error\x1b[0m");
    });

    it("should append params to the message when extra args are passed", () => {
        initAndReset();

        writeToLogFile("info", "hello", "world", { k: "v" }, 42);

        const entry = JSON.parse(writtenData[0]);
        assert.strictEqual(entry.message, 'hello world {"k":"v"} 42');
        assert.ok(!("params" in entry));
    });

    it("should write a JSON log-ended-with-command entry on async close", async () => {
        initAndReset();

        await closeFileLogger();

        assert.strictEqual(writtenData.length, 1);
        const entry = JSON.parse(writtenData[0]);
        assert.strictEqual(entry.level, "info");
        assert.ok(entry.message.includes("Log ended, command:"));
    });

    it("should produce valid NDJSON (each line parseable)", () => {
        initAndReset();

        writeToLogFile("info", "first");
        writeToLogFile("error", "second");
        writeToLogFile("verbose", "third");

        for (const data of writtenData) {
            assert.ok(data.endsWith("\n"), "Each entry should end with newline");
            const parsed = JSON.parse(data);
            assert.ok(parsed.timestamp);
            assert.ok(parsed.level);
            assert.ok(!("source" in parsed));
        }
    });
});

describe("fileLogger - error handling", () => {
    beforeEach(() => {
        writtenData = [];
        mockStreamError = null;
        currentFormat = "json";
        currentVerbosity = "verbose";
    });

    afterEach(() => {
        closeFileLoggerSync();
    });

    it("should call warnFn and remain inactive on stream error during init", () => {
        mockStreamError = new Error("disk full");
        const warnings = [];

        initializeFileLogger("/tmp/test.log", (msg) => warnings.push(msg));

        assert.strictEqual(isFileLoggingActive(), false);
        assert.ok(warnings.some((w) => w.includes("disk full")));
    });

    it("should call warnFn once when a mid-session write throws", () => {
        const warnings = [];
        initializeFileLogger("/tmp/test.log", (msg) => warnings.push(msg));
        writtenData = [];

        const originalWrite = mockWriteStream.write;
        mockWriteStream.write = () => {
            throw new Error("disk full mid-session");
        };

        try {
            writeToLogFile("info", "first");
            writeToLogFile("info", "second"); // already inactive, should not re-warn
        } finally {
            mockWriteStream.write = originalWrite;
        }

        assert.strictEqual(isFileLoggingActive(), false);
        assert.strictEqual(
            warnings.filter((w) => w.includes("disk full mid-session")).length,
            1
        );
    });

    it("should handle closeFileLoggerSync when not initialized", () => {
        closeFileLoggerSync();
        assert.strictEqual(isFileLoggingActive(), false);
    });

    it("should handle closeFileLogger when not initialized", async () => {
        await closeFileLogger();
        assert.strictEqual(isFileLoggingActive(), false);
    });

    it("should be a no-op when closeFileLogger is called twice", async () => {
        initAndReset();

        await closeFileLogger();
        const after_first = writtenData.length;
        await closeFileLogger();

        assert.strictEqual(writtenData.length, after_first);
        assert.strictEqual(isFileLoggingActive(), false);
    });
});

describe("fileLogger - verbosity filter", () => {
    beforeEach(() => {
        writtenData = [];
        mockStreamError = null;
        currentFormat = "json";
        currentVerbosity = "verbose";
    });

    afterEach(() => {
        closeFileLoggerSync();
    });

    it("verbose verbosity writes every level", () => {
        currentVerbosity = "verbose";
        initAndReset();

        writeToLogFile("info", "i");
        writeToLogFile("warning", "w");
        writeToLogFile("error", "e");
        writeToLogFile("verbose", "v");

        assert.strictEqual(writtenData.length, 4);
    });

    it("normal verbosity drops verbose entries", () => {
        currentVerbosity = "normal";
        initAndReset();

        writeToLogFile("info", "i");
        writeToLogFile("warning", "w");
        writeToLogFile("error", "e");
        writeToLogFile("verbose", "v");

        assert.strictEqual(writtenData.length, 3);
        const levels = writtenData.map((d) => JSON.parse(d).level);
        assert.deepEqual(levels, ["info", "warning", "error"]);
    });

    it("silent verbosity records only error entries", async () => {
        // The file is still created so errors have somewhere to land — silent
        // mirrors console silent semantics (errors always surface) rather than
        // disabling file logging entirely.
        currentVerbosity = "silent";
        initializeFileLogger("/tmp/test.log", () => { });
        writtenData = [];

        writeToLogFile("info", "i");
        writeToLogFile("warning", "w");
        writeToLogFile("verbose", "v");
        writeToLogFile("error", "boom");

        assert.strictEqual(writtenData.length, 1);
        const entry = JSON.parse(writtenData[0]);
        assert.strictEqual(entry.level, "error");
        assert.strictEqual(entry.message, "boom");
    });

    it("silent verbosity skips the session-start and session-end entries", async () => {
        currentVerbosity = "silent";
        initializeFileLogger("/tmp/test.log", () => { });

        // Session-start (info-level) is filtered out.
        assert.strictEqual(writtenData.length, 0);

        await closeFileLogger();

        // Session-end (info-level) is also filtered out.
        assert.strictEqual(writtenData.length, 0);
    });
});
