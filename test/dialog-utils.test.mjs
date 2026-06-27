import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

await import("../extension/dialog-utils.js");

const dialogUtils = globalThis.CodexSelectionDialogUtils;
const root = new URL("..", import.meta.url).pathname;

describe("dialog utilities", () => {
  it("keeps the floating logo at a fixed screen size when the page is zoomed", () => {
    const cssPx = dialogUtils.getScreenFixedCssPx(34, {
      outerWidth: 1600,
      innerWidth: 800
    });

    assert.equal(cssPx, 17);
  });

  it("clamps dragged dialogs to the visible viewport", () => {
    const position = dialogUtils.clampDialogPosition({
      left: 1200,
      top: -50,
      width: 368,
      height: 320,
      scrollX: 100,
      scrollY: 200,
      viewportWidth: 800,
      viewportHeight: 600,
      margin: 8
    });

    assert.deepEqual(position, {
      left: 524,
      top: 208
    });
  });

  it("places fixed dialogs in viewport coordinates instead of document coordinates", () => {
    const position = dialogUtils.getInitialFixedDialogPosition({
      rect: { left: 1000, bottom: 1200 },
      width: 368,
      height: 320,
      scrollX: 200,
      scrollY: 900,
      viewportWidth: 800,
      viewportHeight: 600,
      margin: 8,
      gap: 10
    });

    assert.deepEqual(position, {
      left: 424,
      top: 272
    });
  });

  it("clamps fixed dialogs to the visual viewport origin when it is shifted", () => {
    const position = dialogUtils.clampDialogPosition({
      left: 0,
      top: 0,
      width: 300,
      height: 280,
      viewportLeft: 12,
      viewportTop: 84,
      viewportWidth: 720,
      viewportHeight: 540,
      margin: 8
    });

    assert.deepEqual(position, {
      left: 20,
      top: 92
    });
  });

  it("places the action button using its zoom-adjusted css size", () => {
    const position = dialogUtils.getActionButtonPosition({
      rect: { left: 790, bottom: 300 },
      scrollX: 0,
      scrollY: 0,
      viewportWidth: 800,
      buttonSize: 17,
      margin: 8,
      gap: 8
    });

    assert.deepEqual(position, {
      left: 775,
      top: 308
    });
  });
});

describe("dialog stylesheet", () => {
  it("does not use rounded corners for extension chrome", () => {
    const styles = readFileSync(path.join(root, "extension", "styles.css"), "utf8");
    const radiusValues = Array.from(
      styles.matchAll(/border-radius:\s*([^;]+);/g),
      (match) => match[1].trim()
    );

    assert.ok(radiusValues.length > 0);
    assert.deepEqual([...new Set(radiusValues)], ["0"]);
  });

  it("makes Codex dialogs resizable", () => {
    const styles = readFileSync(path.join(root, "extension", "styles.css"), "utf8");

    assert.match(styles, /#codex-selection-explainer-dialog\s*\{[^}]*resize:\s*both;/s);
  });

  it("keeps Codex popups fixed inside the visible viewport", () => {
    const styles = readFileSync(path.join(root, "extension", "styles.css"), "utf8");

    assert.match(styles, /#codex-selection-explainer-dialog\s*\{[^}]*position:\s*fixed;/s);
    assert.match(styles, /#codex-selection-explainer-dialog\s*\{[^}]*max-width:\s*calc\(100vw - 16px\);/s);
    assert.match(styles, /#codex-selection-explainer-dialog\s*\{[^}]*max-height:\s*calc\(100vh - 16px\);/s);
    assert.match(styles, /#codex-selection-explainer-history-popover\s*\{[^}]*position:\s*fixed;/s);
    assert.match(styles, /#codex-selection-explainer-history-popover\s*\{[^}]*max-height:\s*min\(320px, calc\(100vh - 16px\)\);/s);
  });

  it("uses a more compact Codex dialog scale", () => {
    const styles = readFileSync(path.join(root, "extension", "styles.css"), "utf8");

    assert.match(styles, /#codex-selection-explainer-dialog\s*\{[^}]*width:\s*min\(348px, calc\(100vw - 16px\)\);/s);
    assert.match(styles, /#codex-selection-explainer-dialog\s*\{[^}]*min-width:\s*min\(280px, calc\(100vw - 16px\)\);/s);
    assert.match(styles, /#codex-selection-explainer-dialog textarea\s*\{[^}]*font-size:\s*12px;/s);
    assert.match(styles, /#codex-selection-explainer-dialog \.codex-selection-explainer-output\s*\{[^}]*font-size:\s*12px;/s);
  });

  it("uses compact history markers and line-limited history blocks", () => {
    const styles = readFileSync(path.join(root, "extension", "styles.css"), "utf8");

    assert.match(styles, /\.codex-selection-explainer-history-marker::after\s*\{[^}]*height:\s*1px;/s);
    assert.match(
      styles,
      /\.codex-selection-explainer-history-selection\.is-collapsed\s*\{[^}]*--codex-selection-explainer-history-lines:\s*5;/s
    );
    assert.match(
      styles,
      /\.codex-selection-explainer-history-answer\s*\{[^}]*--codex-selection-explainer-history-lines:\s*10;/s
    );
  });
});
