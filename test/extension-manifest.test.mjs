import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(
  readFileSync(path.join(root, "extension", "manifest.json"), "utf8")
);

describe("extension manifest", () => {
  it("loads helper scripts before the content script", () => {
    assert.deepEqual(manifest.content_scripts[0].js, [
      "vendor/katex/katex.min.js",
      "context-utils.js",
      "selection-highlight.js",
      "dialog-utils.js",
      "render-math.js",
      "history-store.js",
      "anchor-utils.js",
      "runtime-utils.js",
      "content-script.js"
    ]);
  });

  it("loads local KaTeX styles and exposes its fonts", () => {
    assert.equal(manifest.content_scripts[0].css[0], "vendor/katex/katex.min.css");
    assert.deepEqual(manifest.web_accessible_resources, [
      {
        resources: ["vendor/katex/fonts/*"],
        matches: ["<all_urls>"]
      }
    ]);
  });

  it("declares a complete generated icon set", () => {
    assert.deepEqual(Object.keys(manifest.icons).sort(), ["128", "16", "32", "48"]);
    assert.deepEqual(Object.keys(manifest.action.default_icon).sort(), [
      "128",
      "16",
      "32",
      "48"
    ]);

    for (const iconPath of Object.values(manifest.icons)) {
      assert.equal(
        existsSync(path.join(root, "extension", iconPath)),
        true,
        `${iconPath} should exist`
      );
    }
  });
});
