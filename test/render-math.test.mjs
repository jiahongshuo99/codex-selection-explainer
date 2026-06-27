import assert from "node:assert/strict";
import { describe, it } from "node:test";

await import("../extension/render-math.js");

const renderMath = globalThis.CodexSelectionRenderMath;

describe("math response renderer", () => {
  it("splits text into plain text, inline latex, and display latex segments", () => {
    const segments = renderMath.splitMathSegments(
      "设 \\(A\\in \\mathbb{R}^{m\\times n}\\)，且 \\[x\\in \\mathbb{R}^n\\]."
    );

    assert.deepEqual(segments, [
      { type: "text", text: "设 " },
      { type: "math", text: "A\\in \\mathbb{R}^{m\\times n}", displayMode: false },
      { type: "text", text: "，且 " },
      { type: "math", text: "x\\in \\mathbb{R}^n", displayMode: true },
      { type: "text", text: "." }
    ]);
  });

  it("leaves unmatched delimiters as plain text", () => {
    assert.deepEqual(renderMath.splitMathSegments("坏公式 \\(A+B"), [
      { type: "text", text: "坏公式 \\(A+B" }
    ]);
  });
});
