(function attachAnchorUtils(global) {
  const DEFAULT_CONTEXT_LENGTH = 80;
  const EXCLUDED_TEXT_PARENTS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION"
  ]);

  function buildTextAnchorFromText({
    fullText = "",
    startIndex = 0,
    endIndex = 0,
    contextLength = DEFAULT_CONTEXT_LENGTH
  }) {
    const start = clampIndex(startIndex, fullText.length);
    const end = clampIndex(Math.max(endIndex, start), fullText.length);

    return {
      exactText: fullText.slice(start, end),
      prefixText: fullText.slice(Math.max(0, start - contextLength), start),
      suffixText: fullText.slice(end, Math.min(fullText.length, end + contextLength))
    };
  }

  function buildTextAnchorFromRange(range, root, contextLength = DEFAULT_CONTEXT_LENGTH) {
    const doc = root?.ownerDocument || range?.commonAncestorContainer?.ownerDocument || global.document;
    const body = doc?.body || root;
    const index = buildTextNodeIndex(body);
    const startIndex = findRangeBoundaryIndex(index, range.startContainer, range.startOffset);
    const endIndex = findRangeBoundaryIndex(index, range.endContainer, range.endOffset);

    return buildTextAnchorFromText({
      fullText: index.text,
      startIndex,
      endIndex,
      contextLength
    });
  }

  function findAnchorMatchInText(fullText, anchor) {
    const exactText = String(anchor?.exactText || "");

    if (!exactText) {
      return null;
    }

    const candidates = [];
    let cursor = 0;

    while (cursor < fullText.length) {
      const startIndex = fullText.indexOf(exactText, cursor);
      if (startIndex === -1) {
        break;
      }

      candidates.push({
        startIndex,
        endIndex: startIndex + exactText.length,
        score: scoreAnchorCandidate(fullText, startIndex, exactText.length, anchor)
      });
      cursor = startIndex + Math.max(1, exactText.length);
    }

    if (!candidates.length) {
      return null;
    }

    candidates.sort((a, b) => b.score - a.score || a.startIndex - b.startIndex);
    const best = candidates[0];
    return {
      startIndex: best.startIndex,
      endIndex: best.endIndex
    };
  }

  function findAnchorRange(doc, anchor) {
    const root = doc?.body;
    const index = buildTextNodeIndex(root);
    const match = findAnchorMatchInText(index.text, anchor);

    if (!match) {
      return null;
    }

    const start = findNodePosition(index.nodes, match.startIndex);
    const end = findNodePosition(index.nodes, match.endIndex);

    if (!start || !end) {
      return null;
    }

    const range = doc.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  }

  function buildTextNodeIndex(root) {
    if (!root?.ownerDocument) {
      return { text: "", nodes: [] };
    }

    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, global.NodeFilter?.SHOW_TEXT || 4, {
      acceptNode(node) {
        if (!node.nodeValue || isExcludedTextNode(node)) {
          return global.NodeFilter?.FILTER_REJECT || 2;
        }

        return global.NodeFilter?.FILTER_ACCEPT || 1;
      }
    });
    const nodes = [];
    let text = "";
    let node = walker.nextNode();

    while (node) {
      const start = text.length;
      text += node.nodeValue;
      nodes.push({
        node,
        start,
        end: text.length
      });
      node = walker.nextNode();
    }

    return { text, nodes };
  }

  function findRangeBoundaryIndex(index, node, offset) {
    for (const entry of index.nodes) {
      if (entry.node === node) {
        return entry.start + offset;
      }
    }

    return 0;
  }

  function findNodePosition(nodes, index) {
    for (const entry of nodes) {
      if (index >= entry.start && index <= entry.end) {
        return {
          node: entry.node,
          offset: Math.min(entry.node.nodeValue.length, Math.max(0, index - entry.start))
        };
      }
    }

    const last = nodes[nodes.length - 1];
    if (last && index === last.end) {
      return {
        node: last.node,
        offset: last.node.nodeValue.length
      };
    }

    return null;
  }

  function scoreAnchorCandidate(fullText, startIndex, exactLength, anchor) {
    const prefix = String(anchor?.prefixText || "");
    const suffix = String(anchor?.suffixText || "");
    const before = fullText.slice(Math.max(0, startIndex - prefix.length), startIndex);
    const after = fullText.slice(startIndex + exactLength, startIndex + exactLength + suffix.length);
    let score = 0;

    if (prefix && before === prefix) {
      score += 2;
    }
    if (suffix && after === suffix) {
      score += 2;
    }

    score += commonSuffixLength(before, prefix) / Math.max(1, prefix.length);
    score += commonPrefixLength(after, suffix) / Math.max(1, suffix.length);
    return score;
  }

  function commonPrefixLength(a, b) {
    let count = 0;
    while (count < a.length && count < b.length && a[count] === b[count]) {
      count += 1;
    }
    return count;
  }

  function commonSuffixLength(a, b) {
    let count = 0;
    while (
      count < a.length &&
      count < b.length &&
      a[a.length - 1 - count] === b[b.length - 1 - count]
    ) {
      count += 1;
    }
    return count;
  }

  function isExcludedTextNode(node) {
    let current = node.parentElement;

    while (current) {
      if (EXCLUDED_TEXT_PARENTS.has(current.tagName)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function clampIndex(value, length) {
    const number = Number(value);
    return Math.min(Math.max(Number.isFinite(number) ? number : 0, 0), length);
  }

  global.CodexSelectionAnchorUtils = {
    buildTextAnchorFromRange,
    buildTextAnchorFromText,
    buildTextNodeIndex,
    findAnchorMatchInText,
    findAnchorRange
  };
})(globalThis);
