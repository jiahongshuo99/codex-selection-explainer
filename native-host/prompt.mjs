const LIMITS = {
  question: 1_000,
  selection: 8_000,
  title: 300,
  url: 700,
  meta: 700,
  surroundingText: 6_000,
  pageText: 6_000,
  heading: 180,
  headings: 10,
  link: 240,
  links: 8
};

function asString(value) {
  return typeof value === "string" ? value : "";
}

function truncate(value, maxLength) {
  const text = asString(value).trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 7)).trimEnd()}\n[已截断]`;
}

function normalizeHeadings(headings) {
  if (!Array.isArray(headings)) {
    return [];
  }

  return headings
    .map((heading) => truncate(heading, LIMITS.heading))
    .filter(Boolean)
    .slice(0, LIMITS.headings);
}

function normalizeStringList(values, maxItems, maxLength) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => truncate(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeRequest(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Request must be an object");
  }

  if (input.type !== "explain") {
    throw new Error(`Unsupported request type: ${asString(input.type) || "unknown"}`);
  }

  const selection = truncate(input.selection, LIMITS.selection);

  if (!selection) {
    throw new Error("No selected text was provided");
  }

  const context = input.context && typeof input.context === "object" ? input.context : {};
  const question = truncate(input.question, LIMITS.question) || "请解释这段划线内容。";

  return {
    type: "explain",
    question,
    selection,
    context: {
      title: truncate(context.title, LIMITS.title),
      tabTitle: truncate(context.tabTitle, LIMITS.title),
      documentTitle: truncate(context.documentTitle, LIMITS.title),
      url: truncate(context.url, LIMITS.url),
      origin: truncate(context.origin, LIMITS.url),
      path: truncate(context.path, LIMITS.url),
      canonicalUrl: truncate(context.canonicalUrl, LIMITS.url),
      metaDescription: truncate(context.metaDescription, LIMITS.meta),
      metaKeywords: truncate(context.metaKeywords, LIMITS.meta),
      siteName: truncate(context.siteName, LIMITS.meta),
      author: truncate(context.author, LIMITS.meta),
      publishedTime: truncate(context.publishedTime, LIMITS.meta),
      modifiedTime: truncate(context.modifiedTime, LIMITS.meta),
      pageLanguage: truncate(context.pageLanguage, LIMITS.meta),
      referrer: truncate(context.referrer, LIMITS.url),
      viewport: truncate(context.viewport, LIMITS.meta),
      breadcrumbText: truncate(context.breadcrumbText, LIMITS.meta),
      selectedElement: truncate(context.selectedElement, LIMITS.meta),
      selectedElementPath: truncate(context.selectedElementPath, LIMITS.meta),
      surroundingText: truncate(context.surroundingText, LIMITS.surroundingText),
      pageText: truncate(context.pageText, LIMITS.pageText),
      headings: normalizeHeadings(context.headings),
      nearbyLinks: normalizeStringList(context.nearbyLinks, LIMITS.links, LIMITS.link)
    }
  };
}

export function buildPrompt(input) {
  const request = normalizeRequest(input);
  const headings = request.context.headings.length
    ? request.context.headings.join(" > ")
    : "未提供";
  const nearbyLinks = request.context.nearbyLinks.length
    ? request.context.nearbyLinks.join("\n")
    : "未提供";

  return [
    "你是一个浏览器划线解释助手。请用中文回答用户问题。",
    "",
    "回答要求：",
    "- 直接解释划线内容和用户问题之间的关系。",
    "- 优先基于划线内容、页面标题、URL、附近正文和标题层级来回答。",
    "- 如果上下文不足，请明确说明哪些部分是在推测。",
    "- 不要尝试执行本地命令，不要读取用户文件，不要修改任何文件。",
    "- 回答保持紧凑：先给结论，再补必要背景。",
    "",
    `用户问题：${request.question}`,
    "",
    "划线内容：",
    "<<<SELECTED_TEXT",
    request.selection,
    "SELECTED_TEXT>>>",
    "",
    "页面上下文：",
    `页面标题：${request.context.title || "未提供"}`,
    `标签页标题：${request.context.tabTitle || request.context.title || "未提供"}`,
    `页面 URL：${request.context.url || "未提供"}`,
    `Origin：${request.context.origin || "未提供"}`,
    `Path：${request.context.path || "未提供"}`,
    `Canonical URL：${request.context.canonicalUrl || "未提供"}`,
    `Meta description：${request.context.metaDescription || "未提供"}`,
    `Meta keywords：${request.context.metaKeywords || "未提供"}`,
    `站点名称：${request.context.siteName || "未提供"}`,
    `作者：${request.context.author || "未提供"}`,
    `发布时间：${request.context.publishedTime || "未提供"}`,
    `更新时间：${request.context.modifiedTime || "未提供"}`,
    `页面语言：${request.context.pageLanguage || "未提供"}`,
    `Referrer：${request.context.referrer || "未提供"}`,
    `视口：${request.context.viewport || "未提供"}`,
    `相关标题：${headings}`,
    `面包屑：${request.context.breadcrumbText || "未提供"}`,
    `选区元素：${request.context.selectedElement || "未提供"}`,
    `选区元素路径：${request.context.selectedElementPath || "未提供"}`,
    "",
    "附近链接：",
    nearbyLinks,
    "",
    "选区附近正文：",
    "<<<SURROUNDING_TEXT",
    request.context.surroundingText || "未提供",
    "SURROUNDING_TEXT>>>",
    "",
    "整页相关文本：",
    "<<<PAGE_TEXT",
    request.context.pageText || "未提供",
    "PAGE_TEXT>>>"
  ].join("\n");
}
