import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { parseCodexUsage } from "../native-host/codex-runner.mjs";
import { appendUsageLog, buildUsageLogRecord } from "../native-host/usage-log.mjs";

describe("codex usage parsing", () => {
  it("extracts the last turn.completed usage from mixed stdout", () => {
    const usage = parseCodexUsage([
      "2026-06-27T00:18:32Z WARN not json",
      "{\"type\":\"turn.started\"}",
      "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":100,\"cached_input_tokens\":20,\"output_tokens\":30,\"reasoning_output_tokens\":10}}"
    ].join("\n"));

    assert.deepEqual(usage, {
      input_tokens: 100,
      cached_input_tokens: 20,
      output_tokens: 30,
      reasoning_output_tokens: 10,
      total_tokens: 130
    });
  });
});

describe("usage log", () => {
  it("records only metadata, lengths, timings, and token usage", async () => {
    const record = buildUsageLogRecord({
      request: {
        question: "解释这段内容",
        selection: "Do not persist this selected text",
        context: {
          url: "https://example.com/private/path?q=secret",
          title: "Sensitive page title",
          tabTitle: "Sensitive tab title",
          surroundingText: "Do not persist surrounding text",
          pageText: "Do not persist page text"
        }
      },
      prompt: "x".repeat(321),
      elapsedMs: 456,
      usage: {
        input_tokens: 100,
        cached_input_tokens: 10,
        output_tokens: 25,
        reasoning_output_tokens: 5,
        total_tokens: 125
      },
      ok: true
    });

    assert.equal(record.url_host, "example.com");
    assert.equal(record.url_origin, "https://example.com");
    assert.equal(record.selected_chars, 33);
    assert.equal(record.question_chars, 6);
    assert.equal(record.surrounding_chars, 31);
    assert.equal(record.page_text_chars, 24);
    assert.equal(record.prompt_chars, 321);
    assert.equal(record.elapsed_ms, 456);
    assert.equal(record.total_tokens, 125);
    assert.equal(JSON.stringify(record).includes("Do not persist"), false);
    assert.equal(JSON.stringify(record).includes("Sensitive"), false);
    assert.equal(JSON.stringify(record).includes("secret"), false);
  });

  it("appends records as jsonl", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "codex-selection-log-test-"));
    const logPath = path.join(dir, "usage.jsonl");

    try {
      await appendUsageLog(logPath, { a: 1 });
      await appendUsageLog(logPath, { b: 2 });

      assert.equal(await readFile(logPath, "utf8"), "{\"a\":1}\n{\"b\":2}\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
