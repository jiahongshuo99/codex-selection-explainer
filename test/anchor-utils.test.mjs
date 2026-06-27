import assert from "node:assert/strict";
import { describe, it } from "node:test";

await import("../extension/anchor-utils.js");

const anchorUtils = globalThis.CodexSelectionAnchorUtils;

describe("text anchor utilities", () => {
  it("builds prefix and suffix context around selected text", () => {
    const anchor = anchorUtils.buildTextAnchorFromText({
      fullText: "Before the selected theorem after the proof.",
      startIndex: 11,
      endIndex: 27,
      contextLength: 9
    });

    assert.deepEqual(anchor, {
      exactText: "selected theorem",
      prefixText: "fore the ",
      suffixText: " after th"
    });
  });

  it("uses prefix and suffix to disambiguate repeated text", () => {
    const text = "alpha target omega. beta target gamma.";
    const match = anchorUtils.findAnchorMatchInText(text, {
      exactText: "target",
      prefixText: "beta ",
      suffixText: " gamma"
    });

    assert.deepEqual(match, {
      startIndex: 25,
      endIndex: 31
    });
  });
});
