(function attachContextUtils(global) {
  const DEFAULT_LIMITS = {
    surroundingText: 8_000,
    pageText: 6_000,
    meta: 500,
    heading: 180,
    headings: 10,
    links: 8
  };

  function truncate(value, maxLength) {
    const text = typeof value === "string" ? value.trim() : "";

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 7)).trimEnd()}\n[已截断]`;
  }

  function compactText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function readVisibleText(element) {
    return compactText(element?.innerText || element?.textContent || "");
  }

  function findContextBlock(element, doc = document) {
    return (
      element?.closest?.("p, li, blockquote, pre, table, figure, article, section, main, [role='main']") ||
      doc.querySelector?.("main, article, [role='main']") ||
      doc.body
    );
  }

  function findMainContent(doc = document) {
    return doc.querySelector?.("main, article, [role='main']") || doc.body;
  }

  function getMeta(doc, names) {
    for (const name of names) {
      const element =
        doc.querySelector?.(`meta[name='${name}']`) ||
        doc.querySelector?.(`meta[property='${name}']`);
      const content = truncate(element?.content || "", DEFAULT_LIMITS.meta);

      if (content) {
        return content;
      }
    }

    return "";
  }

  function getCanonicalUrl(doc = document) {
    return doc.querySelector?.("link[rel='canonical']")?.href || "";
  }

  function sanitizeClassName(name) {
    return String(name).trim().replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function describeElement(element) {
    if (!element?.tagName) {
      return "";
    }

    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes = String(element.className || "")
      .split(/\s+/)
      .map(sanitizeClassName)
      .filter(Boolean)
      .slice(0, 3)
      .map((className) => `.${className}`)
      .join("");

    return `${tag}${id}${classes}`;
  }

  function buildCssPath(element) {
    const parts = [];
    let current = element?.nodeType === 1 ? element : element?.parentElement;

    while (current && current.tagName && parts.length < 8) {
      parts.unshift(describeElement(current));

      if (current.tagName.toLowerCase() === "html") {
        break;
      }

      current = current.parentElement;
    }

    return parts.filter(Boolean).join(" > ");
  }

  function collectRelevantHeadings(doc = document, element) {
    const headings = Array.from(doc.querySelectorAll?.("h1, h2, h3") || [])
      .map((heading) => compactText(heading.innerText || heading.textContent || ""))
      .filter(Boolean)
      .slice(-DEFAULT_LIMITS.headings)
      .map((heading) => truncate(heading, DEFAULT_LIMITS.heading));

    const closestHeading = element?.closest?.("h1, h2, h3");

    if (closestHeading) {
      headings.push(truncate(readVisibleText(closestHeading), DEFAULT_LIMITS.heading));
    }

    return Array.from(new Set(headings)).filter(Boolean).slice(-DEFAULT_LIMITS.headings);
  }

  function collectBreadcrumbText(doc = document) {
    const links = Array.from(
      doc.querySelectorAll?.("nav a, [aria-label*='breadcrumb' i] a, .breadcrumb a") || []
    )
      .map((link) => compactText(link.innerText || link.textContent || ""))
      .filter(Boolean)
      .slice(-6);

    return links.join(" > ");
  }

  function collectNearbyLinks(block) {
    return Array.from(block?.querySelectorAll?.("a[href]") || [])
      .map((link) => {
        const label = compactText(link.innerText || link.textContent || "");
        const href = link.href || "";
        return label && href ? `${label} (${href})` : label || href;
      })
      .filter(Boolean)
      .slice(0, DEFAULT_LIMITS.links);
  }

  function collectPageContext(options = {}) {
    const doc = options.document || document;
    const loc = options.location || location;
    const nav = options.navigator || navigator;
    const viewport = options.viewport || {
      width: global.innerWidth || 0,
      height: global.innerHeight || 0
    };
    const container = options.container;
    const block = options.block || findContextBlock(container, doc);
    const main = findMainContent(doc);
    const title = compactText(doc.title || "");

    return {
      title,
      tabTitle: title,
      documentTitle: title,
      url: loc.href || "",
      origin: loc.origin || "",
      path: loc.pathname || "",
      canonicalUrl: getCanonicalUrl(doc),
      metaDescription: getMeta(doc, ["description", "og:description", "twitter:description"]),
      metaKeywords: getMeta(doc, ["keywords"]),
      siteName: getMeta(doc, ["og:site_name", "application-name"]),
      author: getMeta(doc, ["author", "article:author"]),
      publishedTime: getMeta(doc, ["article:published_time", "date", "pubdate"]),
      modifiedTime: getMeta(doc, ["article:modified_time", "last-modified"]),
      pageLanguage: doc.documentElement?.lang || nav.language || "",
      referrer: doc.referrer || "",
      viewport: `${viewport.width || 0}x${viewport.height || 0}`,
      headings: collectRelevantHeadings(doc, container),
      breadcrumbText: collectBreadcrumbText(doc),
      selectedElement: describeElement(container),
      selectedElementPath: buildCssPath(container),
      surroundingText: truncate(readVisibleText(block), DEFAULT_LIMITS.surroundingText),
      pageText: truncate(readVisibleText(main), DEFAULT_LIMITS.pageText),
      nearbyLinks: collectNearbyLinks(block)
    };
  }

  global.CodexSelectionContextUtils = {
    buildCssPath,
    collectPageContext,
    collectRelevantHeadings,
    findContextBlock,
    readVisibleText,
    truncate
  };
})(globalThis);
