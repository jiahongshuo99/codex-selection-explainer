import assert from "node:assert/strict";
import { describe, it } from "node:test";

await import("../extension/history-store.js");

const historyStore = globalThis.CodexSelectionHistoryStore;

describe("history store helpers", () => {
  it("indexes records by URL without the hash fragment", () => {
    assert.equal(
      historyStore.createUrlKey("https://example.test/book?page=1#section-2"),
      "https://example.test/book?page=1"
    );
  });

  it("builds a durable explanation record with an anchor key", () => {
    const record = historyStore.buildHistoryRecord({
      id: "fixed-id",
      now: "2026-06-27T01:00:00.000Z",
      selection: "A matrix maps vectors.",
      question: "解释",
      answer: "这里的 \\(A\\in \\mathbb{R}^{m\\times n}\\) 是矩阵。",
      context: {
        url: "https://example.test/linear#matrix",
        title: "Linear Algebra"
      },
      anchor: {
        exactText: "A matrix maps vectors.",
        prefixText: "Before. ",
        suffixText: " After."
      }
    });

    assert.equal(record.urlKey, "https://example.test/linear");
    assert.equal(record.id, "fixed-id");
    assert.equal(record.anchorKey.length > 10, true);
    assert.equal(record.answer.includes("\\(A\\in"), true);
    assert.equal(record.threadId, "fixed-id");
    assert.equal(record.contextSnapshot.url, "https://example.test/linear#matrix");
    assert.deepEqual(
      record.messages.map((message) => [message.role, message.text]),
      [
        ["user", "解释"],
        ["assistant", "这里的 \\(A\\in \\mathbb{R}^{m\\times n}\\) 是矩阵。"]
      ]
    );
  });

  it("appends turns to a thread without rewriting prior messages or context", () => {
    const record = historyStore.buildHistoryRecord({
      id: "thread-1",
      now: "2026-06-27T01:00:00.000Z",
      selection: "L2 norm",
      question: "第一问",
      answer: "第一答",
      context: {
        url: "https://example.test/a#section",
        title: "Norms"
      },
      anchor: { exactText: "L2 norm", prefixText: "", suffixText: "" }
    });
    const next = historyStore.appendThreadTurn(record, {
      now: "2026-06-27T01:01:00.000Z",
      question: "第二问",
      answer: "第二答",
      usage: { input_tokens: 10, cached_input_tokens: 6 }
    });

    assert.equal(next.threadId, "thread-1");
    assert.equal(next.contextSnapshot.url, "https://example.test/a#section");
    assert.equal(next.question, "第二问");
    assert.equal(next.answer, "第二答");
    assert.equal(next.messages.length, 4);
    assert.deepEqual(
      next.messages.map((message) => [message.role, message.text]),
      [
        ["user", "第一问"],
        ["assistant", "第一答"],
        ["user", "第二问"],
        ["assistant", "第二答"]
      ]
    );
    assert.deepEqual(next.messages[3].usage, { input_tokens: 10, cached_input_tokens: 6 });
    assert.notEqual(next.messages[0].id, next.messages[2].id);
  });

  it("updates a stored thread by appending a turn", () => {
    const record = historyStore.buildHistoryRecord({
      id: "thread-1",
      now: "2026-06-27T01:00:00.000Z",
      selection: "first",
      question: "q1",
      answer: "a1",
      context: { url: "https://example.test/a" },
      anchor: { exactText: "first", prefixText: "", suffixText: "" }
    });
    const state = historyStore.addRecordToState(historyStore.createEmptyHistoryState(), record);
    const next = historyStore.appendThreadTurnToState(
      state,
      "https://example.test/a#hash",
      "thread-1",
      {
        now: "2026-06-27T01:02:00.000Z",
        question: "q2",
        answer: "a2"
      }
    );
    const [updated] = historyStore.listRecordsForUrl(next, "https://example.test/a");

    assert.equal(updated.id, "thread-1");
    assert.equal(updated.messages.length, 4);
    assert.equal(updated.question, "q2");
    assert.equal(updated.answer, "a2");
  });

  it("normalizes legacy QA records into thread-compatible records", () => {
    const state = {
      version: 1,
      urls: {
        "https://example.test/a": {
          records: [
            {
              id: "legacy-1",
              urlKey: "https://example.test/a",
              url: "https://example.test/a#old",
              title: "Legacy Page",
              selectionText: "legacy selection",
              question: "旧问题",
              answer: "旧回答",
              createdAt: "2026-06-27T01:00:00.000Z",
              anchor: {
                exactText: "legacy selection",
                prefixText: "",
                suffixText: ""
              }
            }
          ]
        }
      }
    };
    const [record] = historyStore.listRecordsForUrl(state, "https://example.test/a");

    assert.equal(record.threadId, "legacy-1");
    assert.equal(record.contextSnapshot.url, "https://example.test/a#old");
    assert.equal(record.contextSnapshot.title, "Legacy Page");
    assert.deepEqual(
      record.messages.map((message) => [message.role, message.text]),
      [
        ["user", "旧问题"],
        ["assistant", "旧回答"]
      ]
    );
  });

  it("stores newest URL records first and keeps other URLs separate", () => {
    const first = historyStore.buildHistoryRecord({
      id: "1",
      now: "2026-06-27T01:00:00.000Z",
      selection: "first",
      question: "q1",
      answer: "a1",
      context: { url: "https://example.test/a" },
      anchor: { exactText: "first", prefixText: "", suffixText: "" }
    });
    const second = historyStore.buildHistoryRecord({
      id: "2",
      now: "2026-06-27T01:01:00.000Z",
      selection: "second",
      question: "q2",
      answer: "a2",
      context: { url: "https://example.test/a" },
      anchor: { exactText: "second", prefixText: "", suffixText: "" }
    });
    const other = historyStore.buildHistoryRecord({
      id: "3",
      now: "2026-06-27T01:02:00.000Z",
      selection: "other",
      question: "q3",
      answer: "a3",
      context: { url: "https://example.test/b" },
      anchor: { exactText: "other", prefixText: "", suffixText: "" }
    });

    const state = historyStore.addRecordToState(
      historyStore.addRecordToState(
        historyStore.addRecordToState(historyStore.createEmptyHistoryState(), first),
        second
      ),
      other
    );

    assert.deepEqual(
      historyStore.listRecordsForUrl(state, "https://example.test/a").map((record) => record.id),
      ["2", "1"]
    );
    assert.deepEqual(
      historyStore.listRecordsForUrl(state, "https://example.test/b").map((record) => record.id),
      ["3"]
    );
  });

  it("soft-deletes a single history record and leaves other URL records intact", () => {
    const first = historyStore.buildHistoryRecord({
      id: "1",
      now: "2026-06-27T01:00:00.000Z",
      selection: "first",
      question: "q1",
      answer: "a1",
      context: { url: "https://example.test/a" },
      anchor: { exactText: "first", prefixText: "", suffixText: "" }
    });
    const second = historyStore.buildHistoryRecord({
      id: "2",
      now: "2026-06-27T01:01:00.000Z",
      selection: "second",
      question: "q2",
      answer: "a2",
      context: { url: "https://example.test/a" },
      anchor: { exactText: "second", prefixText: "", suffixText: "" }
    });
    const other = historyStore.buildHistoryRecord({
      id: "3",
      now: "2026-06-27T01:02:00.000Z",
      selection: "other",
      question: "q3",
      answer: "a3",
      context: { url: "https://example.test/b" },
      anchor: { exactText: "other", prefixText: "", suffixText: "" }
    });

    const state = historyStore.addRecordToState(
      historyStore.addRecordToState(
        historyStore.addRecordToState(historyStore.createEmptyHistoryState(), first),
        second
      ),
      other
    );
    const next = historyStore.softDeleteRecordFromState(
      state,
      "https://example.test/a#hash",
      "2",
      "2026-06-27T01:03:00.000Z"
    );

    assert.deepEqual(
      historyStore.listRecordsForUrl(next, "https://example.test/a").map((record) => record.id),
      ["1"]
    );
    assert.equal(
      next.urls["https://example.test/a"].records.find((record) => record.id === "2").deletedAt,
      "2026-06-27T01:03:00.000Z"
    );
    assert.deepEqual(
      historyStore.listRecordsForUrl(next, "https://example.test/b").map((record) => record.id),
      ["3"]
    );
  });

  it("keeps soft-deleted final records while hiding them from URL history", () => {
    const record = historyStore.buildHistoryRecord({
      id: "1",
      now: "2026-06-27T01:00:00.000Z",
      selection: "only",
      question: "q",
      answer: "a",
      context: { url: "https://example.test/a" },
      anchor: { exactText: "only", prefixText: "", suffixText: "" }
    });
    const state = historyStore.addRecordToState(historyStore.createEmptyHistoryState(), record);
    const next = historyStore.softDeleteRecordFromState(
      state,
      "https://example.test/a",
      "1",
      "2026-06-27T01:03:00.000Z"
    );

    assert.deepEqual(historyStore.listRecordsForUrl(next, "https://example.test/a"), []);
    assert.equal(next.urls["https://example.test/a"].records.length, 1);
    assert.equal(
      next.urls["https://example.test/a"].records[0].deletedAt,
      "2026-06-27T01:03:00.000Z"
    );
  });
});
