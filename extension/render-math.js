(function attachRenderMath(global) {
  const DELIMITERS = [
    { open: "\\[", close: "\\]", displayMode: true },
    { open: "\\(", close: "\\)", displayMode: false },
    { open: "$$", close: "$$", displayMode: true }
  ];

  function splitMathSegments(text) {
    const source = String(text || "");
    const segments = [];
    let cursor = 0;

    while (cursor < source.length) {
      const next = findNextDelimiter(source, cursor);

      if (!next) {
        pushTextSegment(segments, source.slice(cursor));
        break;
      }

      if (next.index > cursor) {
        pushTextSegment(segments, source.slice(cursor, next.index));
      }

      const start = next.index + next.delimiter.open.length;
      const end = source.indexOf(next.delimiter.close, start);

      if (end === -1) {
        pushTextSegment(segments, source.slice(next.index));
        break;
      }

      segments.push({
        type: "math",
        text: source.slice(start, end).trim(),
        displayMode: next.delimiter.displayMode
      });
      cursor = end + next.delimiter.close.length;
    }

    return segments;
  }

  function renderTextWithMath(container, text, options = {}) {
    const doc = options.document || container.ownerDocument || global.document;
    const katex = options.katex || global.katex;
    container.replaceChildren();

    for (const segment of splitMathSegments(text)) {
      if (segment.type === "text") {
        container.append(doc.createTextNode(segment.text));
        continue;
      }

      const wrapper = doc.createElement(segment.displayMode ? "div" : "span");
      wrapper.className = segment.displayMode
        ? "codex-selection-explainer-math-display"
        : "codex-selection-explainer-math-inline";

      if (katex?.render) {
        try {
          katex.render(segment.text, wrapper, {
            displayMode: segment.displayMode,
            throwOnError: false,
            trust: false,
            strict: "warn"
          });
        } catch {
          wrapper.textContent = formatFallbackMath(segment);
        }
      } else {
        wrapper.textContent = formatFallbackMath(segment);
      }

      container.append(wrapper);
    }
  }

  function findNextDelimiter(source, cursor) {
    let found = null;

    for (const delimiter of DELIMITERS) {
      const index = source.indexOf(delimiter.open, cursor);
      if (index !== -1 && (!found || index < found.index)) {
        found = { index, delimiter };
      }
    }

    return found;
  }

  function pushTextSegment(segments, text) {
    if (!text) {
      return;
    }

    const last = segments[segments.length - 1];
    if (last?.type === "text") {
      last.text += text;
      return;
    }

    segments.push({ type: "text", text });
  }

  function formatFallbackMath(segment) {
    return segment.displayMode ? `\\[${segment.text}\\]` : `\\(${segment.text}\\)`;
  }

  global.CodexSelectionRenderMath = {
    renderTextWithMath,
    splitMathSegments
  };
})(globalThis);
