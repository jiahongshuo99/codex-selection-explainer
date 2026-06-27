import assert from "node:assert/strict";
import { describe, it } from "node:test";

await import("../extension/context-utils.js");
await import("../extension/selection-highlight.js");

const contextUtils = globalThis.CodexSelectionContextUtils;
const highlightUtils = globalThis.CodexSelectionHighlight;

function fakeElement({ tagName = "P", id = "", className = "", innerText = "", parentElement = null } = {}) {
  return {
    tagName,
    id,
    className,
    innerText,
    textContent: innerText,
    parentElement,
    nodeType: 1,
    closest(selector) {
      if (selector.includes("p") && this.tagName === "P") {
        return this;
      }

      return parentElement?.closest?.(selector) || null;
    }
  };
}

function fakeDocument() {
  const canonical = { href: "https://example.test/canonical" };
  const meta = new Map([
    ["description", { content: "A compact explanation of notation." }],
    ["og:site_name", { content: "Deep Learning Book" }],
    ["article:published_time", { content: "2016-11-18" }]
  ]);
  const h1 = { innerText: "Notation" };
  const h2 = { innerText: "Linear Algebra" };

  return {
    title: "Notation - Deep Learning Book",
    referrer: "https://google.test/search?q=notation",
    documentElement: {
      lang: "en"
    },
    body: {
      innerText: "Notation defines symbols used throughout the book."
    },
    querySelector(selector) {
      if (selector === "link[rel='canonical']") {
        return canonical;
      }

      const nameMatch = selector.match(/meta\[name=['"]([^'"]+)['"]\]/);
      const propertyMatch = selector.match(/meta\[property=['"]([^'"]+)['"]\]/);
      return meta.get(nameMatch?.[1] || propertyMatch?.[1]) || null;
    },
    querySelectorAll(selector) {
      if (selector === "h1, h2, h3") {
        return [h1, h2];
      }

      if (selector === "nav a, [aria-label*='breadcrumb' i] a, .breadcrumb a") {
        return [{ innerText: "Book" }, { innerText: "Notation" }];
      }

      return [];
    }
  };
}

describe("browser context utilities", () => {
  it("collects useful page basics beyond selected text", () => {
    const root = fakeElement({ tagName: "ARTICLE", id: "chapter" });
    const paragraph = fakeElement({
      tagName: "P",
      className: "lead intro",
      innerText: "Notation is used throughout mathematics.",
      parentElement: root
    });
    const context = contextUtils.collectPageContext({
      document: fakeDocument(),
      location: {
        href: "https://example.test/contents/notation.html",
        origin: "https://example.test",
        pathname: "/contents/notation.html"
      },
      navigator: { language: "zh-CN" },
      viewport: { width: 1440, height: 900 },
      container: paragraph,
      block: paragraph
    });

    assert.equal(context.url, "https://example.test/contents/notation.html");
    assert.equal(context.tabTitle, "Notation - Deep Learning Book");
    assert.equal(context.canonicalUrl, "https://example.test/canonical");
    assert.equal(context.metaDescription, "A compact explanation of notation.");
    assert.equal(context.siteName, "Deep Learning Book");
    assert.equal(context.pageLanguage, "en");
    assert.equal(context.viewport, "1440x900");
    assert.deepEqual(context.headings, ["Notation", "Linear Algebra"]);
    assert.match(context.selectedElementPath, /article#chapter/);
    assert.match(context.selectedElementPath, /p.lead.intro/);
  });

  it("normalizes selection rects into document-position highlight boxes", () => {
    const rects = highlightUtils.normalizeHighlightRects(
      [
        { top: 10, left: 20, width: 80, height: 18 },
        { top: 32, left: 20, width: 0, height: 18 },
        { top: 54, left: 20, width: 120, height: 18 }
      ],
      { scrollX: 4, scrollY: 12 }
    );

    assert.deepEqual(rects, [
      { top: 22, left: 24, width: 80, height: 18 },
      { top: 66, left: 24, width: 120, height: 18 }
    ]);
  });
});
