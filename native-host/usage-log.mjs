import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export function buildUsageLogRecord({
  request = {},
  prompt = "",
  elapsedMs = 0,
  usage = null,
  ok = false,
  errorType = ""
}) {
  const context = request.context && typeof request.context === "object" ? request.context : {};
  const urlParts = parseSafeUrlParts(context.url);
  const normalizedUsage = normalizeUsageForLog(usage);

  return {
    timestamp: new Date().toISOString(),
    ok: Boolean(ok),
    error_type: errorType || "",
    url_host: urlParts.host,
    url_origin: urlParts.origin,
    selected_chars: stringLength(request.selection),
    question_chars: stringLength(request.question),
    surrounding_chars: stringLength(context.surroundingText),
    page_text_chars: stringLength(context.pageText),
    headings_count: Array.isArray(context.headings) ? context.headings.length : 0,
    nearby_links_count: Array.isArray(context.nearbyLinks) ? context.nearbyLinks.length : 0,
    prompt_chars: stringLength(prompt),
    elapsed_ms: Math.max(0, Math.round(Number(elapsedMs) || 0)),
    has_usage: Boolean(normalizedUsage),
    input_tokens: normalizedUsage?.input_tokens || 0,
    cached_input_tokens: normalizedUsage?.cached_input_tokens || 0,
    output_tokens: normalizedUsage?.output_tokens || 0,
    reasoning_output_tokens: normalizedUsage?.reasoning_output_tokens || 0,
    total_tokens: normalizedUsage?.total_tokens || 0
  };
}

export async function appendUsageLog(logPath, record) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

function parseSafeUrlParts(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { host: "", origin: "" };
  }

  try {
    const url = new URL(value);
    return {
      host: url.host,
      origin: url.origin
    };
  } catch {
    return { host: "", origin: "" };
  }
}

function normalizeUsageForLog(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inputTokens = numberOrZero(usage.input_tokens);
  const cachedInputTokens = numberOrZero(usage.cached_input_tokens);
  const outputTokens = numberOrZero(usage.output_tokens);
  const reasoningOutputTokens = numberOrZero(usage.reasoning_output_tokens);
  const totalTokens =
    numberOrZero(usage.total_tokens) || inputTokens + outputTokens;

  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    total_tokens: totalTokens
  };
}

function stringLength(value) {
  return typeof value === "string" ? value.length : 0;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
