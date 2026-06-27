(function attachSelectionHighlight(global) {
  const HIGHLIGHT_ID = "codex-selection-explainer-highlight";

  function normalizeHighlightRects(rects, scroll = {}) {
    const scrollX = scroll.scrollX || 0;
    const scrollY = scroll.scrollY || 0;

    return Array.from(rects || [])
      .map((rect) => {
        const width = rect.width ?? rect.right - rect.left;
        const height = rect.height ?? rect.bottom - rect.top;

        return {
          top: rect.top + scrollY,
          left: rect.left + scrollX,
          width,
          height
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
  }

  function getRangeHighlightRects(range, win = window) {
    return normalizeHighlightRects(range?.getClientRects?.() || [], {
      scrollX: win.scrollX || 0,
      scrollY: win.scrollY || 0
    });
  }

  function clearSelectionHighlight(doc = document) {
    doc.getElementById?.(HIGHLIGHT_ID)?.remove();
  }

  function renderSelectionHighlight(rects, doc = document) {
    clearSelectionHighlight(doc);

    if (!rects?.length) {
      return null;
    }

    const root = doc.createElement("div");
    root.id = HIGHLIGHT_ID;
    root.setAttribute("aria-hidden", "true");

    for (const rect of rects) {
      const box = doc.createElement("div");
      box.className = "codex-selection-explainer-highlight-box";
      box.style.top = `${rect.top}px`;
      box.style.left = `${rect.left}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      root.append(box);
    }

    doc.documentElement.append(root);
    return root;
  }

  global.CodexSelectionHighlight = {
    clearSelectionHighlight,
    getRangeHighlightRects,
    normalizeHighlightRects,
    renderSelectionHighlight
  };
})(globalThis);
