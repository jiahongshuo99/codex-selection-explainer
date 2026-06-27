import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCodexArgs } from "../native-host/codex-runner.mjs";
import { buildPrompt, normalizeRequest } from "../native-host/prompt.mjs";
import { decodeMessages, encodeMessage } from "../native-host/protocol.mjs";

describe("native messaging protocol", () => {
  it("encodes and decodes little-endian JSON frames", () => {
    const encoded = encodeMessage({ type: "explain", ok: true });

    assert.equal(encoded.readUInt32LE(0), encoded.length - 4);
    assert.deepEqual(decodeMessages(encoded), [{ type: "explain", ok: true }]);
  });

  it("decodes multiple frames from one buffer", () => {
    const buffer = Buffer.concat([
      encodeMessage({ type: "first" }),
      encodeMessage({ type: "second" })
    ]);

    assert.deepEqual(decodeMessages(buffer), [
      { type: "first" },
      { type: "second" }
    ]);
  });
});

describe("prompt builder", () => {
  it("normalizes a browser explain request", () => {
    const request = normalizeRequest({
      type: "explain",
      question: "这句话是什么意思？",
      selection: "Memory is not just storage.",
      context: {
        title: "Agent Memory Notes",
        url: "https://example.test/notes",
        surroundingText: "Before. Memory is not just storage. After.",
        headings: ["Intro", "Memory"]
      }
    });

    assert.equal(request.question, "这句话是什么意思？");
    assert.equal(request.selection, "Memory is not just storage.");
    assert.equal(request.context.title, "Agent Memory Notes");
    assert.deepEqual(request.context.headings, ["Intro", "Memory"]);
  });

  it("builds a Chinese explanation prompt with selected text and page context", () => {
    const prompt = buildPrompt({
      type: "explain",
      question: "解释这段",
      selection: "Graph memory helps agents reason over relations.",
      context: {
        title: "Graphiti README",
        url: "https://github.com/getzep/graphiti",
        surroundingText: "Graph memory helps agents reason over relations.",
        headings: ["Overview"]
      }
    });

    assert.match(prompt, /请用中文回答/);
    assert.match(prompt, /\[USER\]\n解释这段/);
    assert.match(prompt, /划线内容：/);
    assert.match(prompt, /Graph memory helps agents reason over relations\./);
    assert.match(prompt, /页面标题：Graphiti README/);
    assert.match(prompt, /页面 URL：https:\/\/github\.com\/getzep\/graphiti/);
  });

  it("keeps thread prompts append-only so prior turns remain a stable prefix", () => {
    const baseRequest = {
      type: "explain",
      selection: "The squared L2 norm is x^T x.",
      context: {
        title: "Linear Algebra",
        url: "https://example.test/linear",
        surroundingText: "The squared L2 norm is x^T x."
      }
    };
    const firstPrompt = buildPrompt({
      ...baseRequest,
      question: "为什么平方范数更方便？"
    });
    const secondPrompt = buildPrompt({
      ...baseRequest,
      question: "那梯度是什么？",
      threadMessages: [
        { role: "user", text: "为什么平方范数更方便？" },
        { role: "assistant", text: "因为它去掉了平方根，求导更直接。" }
      ]
    });

    assert.equal(secondPrompt.startsWith(`${firstPrompt}\n\n[ASSISTANT]\n`), true);
    assert.match(secondPrompt, /\[USER\]\n那梯度是什么？$/);
  });

  it("includes rich browser page basics in the prompt", () => {
    const prompt = buildPrompt({
      type: "explain",
      question: "解释",
      selection: "diag(a)",
      context: {
        title: "Notation - Deep Learning Book",
        tabTitle: "Notation - Deep Learning Book",
        url: "https://deeplearningbook.org/contents/notation.html",
        canonicalUrl: "https://deeplearningbook.org/contents/notation.html",
        metaDescription: "Notation used throughout the book.",
        siteName: "Deep Learning Book",
        pageLanguage: "en",
        viewport: "1440x900",
        selectedElementPath: "html > body > article#main > p",
        breadcrumbText: "Book > Notation",
        surroundingText: "diag(a) A square diagonal matrix.",
        pageText: "Notation defines mathematical symbols used throughout this book.",
        headings: ["Notation"]
      }
    });

    assert.match(prompt, /标签页标题：Notation - Deep Learning Book/);
    assert.match(prompt, /Canonical URL：https:\/\/deeplearningbook\.org\/contents\/notation\.html/);
    assert.match(prompt, /Meta description：Notation used throughout the book\./);
    assert.match(prompt, /站点名称：Deep Learning Book/);
    assert.match(prompt, /页面语言：en/);
    assert.match(prompt, /视口：1440x900/);
    assert.match(prompt, /选区元素路径：html > body > article#main > p/);
    assert.match(prompt, /面包屑：Book > Notation/);
    assert.match(prompt, /整页相关文本：/);
  });

  it("truncates excessive browser context before building the prompt", () => {
    const prompt = buildPrompt({
      type: "explain",
      question: "解释",
      selection: "x".repeat(20_000),
      context: {
        title: "t".repeat(1_000),
        url: "https://example.test/" + "u".repeat(1_000),
        surroundingText: "s".repeat(30_000),
        headings: Array.from({ length: 20 }, (_, index) => `Heading ${index}`)
      }
    });

    assert.ok(prompt.length < 18_000);
    assert.match(prompt, /\[已截断\]/);
  });
});

describe("codex runner", () => {
  it("places global sandbox and approval flags before the exec subcommand", () => {
    const args = buildCodexArgs({
      outputPath: "/tmp/last-message.txt",
      workspaceDir: "/tmp/workspace",
      model: "gpt-test",
      extraArgs: ["--ignore-rules"]
    });

    assert.deepEqual(args.slice(0, 5), ["-a", "never", "-s", "read-only", "exec"]);
    assert.ok(args.indexOf("--ignore-rules") > args.indexOf("exec"));
    assert.ok(args.includes("-C"));
    assert.ok(args.includes("-"));
  });

  it("enables json output so token usage can be parsed", () => {
    const args = buildCodexArgs({
      outputPath: "/tmp/last-message.txt",
      workspaceDir: "/tmp/workspace"
    });

    assert.ok(args.includes("--json"));
  });
});
