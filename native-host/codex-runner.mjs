import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");
const DEFAULT_CODEX_PATH = "/Applications/Codex.app/Contents/Resources/codex";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_USAGE_LOG_PATH = path.join(MODULE_DIR, "usage.jsonl");

async function fileExists(filePath) {
  try {
    const result = await stat(filePath);
    return result.isFile();
  } catch {
    return false;
  }
}

async function loadConfigFile() {
  const configPath = path.join(MODULE_DIR, "config.json");

  if (!(await fileExists(configPath))) {
    return {};
  }

  const raw = await readFile(configPath, "utf8");
  return JSON.parse(raw);
}

export async function loadHostConfig() {
  const config = await loadConfigFile();
  const workspaceDir = config.workspaceDir
    ? path.resolve(config.workspaceDir)
    : path.join(PROJECT_ROOT, ".codex-browser-workspace");
  const configuredUsageLogPath =
    process.env.CODEX_SELECTION_EXPLAINER_USAGE_LOG_PATH ||
    config.usageLogPath ||
    DEFAULT_USAGE_LOG_PATH;

  return {
    codexPath:
      process.env.CODEX_SELECTION_EXPLAINER_CODEX_PATH ||
      config.codexPath ||
      DEFAULT_CODEX_PATH,
    model: process.env.CODEX_SELECTION_EXPLAINER_MODEL || config.model || "",
    timeoutMs: Number(
      process.env.CODEX_SELECTION_EXPLAINER_TIMEOUT_MS ||
        config.timeoutMs ||
        DEFAULT_TIMEOUT_MS
    ),
    workspaceDir,
    usageLogEnabled: readBooleanConfig(
      process.env.CODEX_SELECTION_EXPLAINER_USAGE_LOG_ENABLED,
      config.usageLogEnabled !== false
    ),
    usageLogPath: path.isAbsolute(configuredUsageLogPath)
      ? configuredUsageLogPath
      : path.resolve(MODULE_DIR, configuredUsageLogPath),
    extraArgs: Array.isArray(config.extraArgs) ? config.extraArgs : []
  };
}

export async function runCodex(prompt, options = {}) {
  const result = await runCodexDetailed(prompt, options);
  return result.text;
}

export async function runCodexDetailed(prompt, options = {}) {
  const config = { ...(await loadHostConfig()), ...options };

  if (!(await fileExists(config.codexPath))) {
    throw new Error(`Codex CLI not found at ${config.codexPath}`);
  }

  await mkdir(config.workspaceDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "codex-selection-explainer-"));
  const outputPath = path.join(tempDir, "last-message.txt");
  const args = buildCodexArgs({
    outputPath,
    workspaceDir: config.workspaceDir,
    model: config.model,
    extraArgs: config.extraArgs
  });

  try {
    const result = await spawnCodex(config.codexPath, args, prompt, config.timeoutMs);
    const usage = parseCodexUsage(result.stdout);
    let finalText = "";

    if (await fileExists(outputPath)) {
      finalText = (await readFile(outputPath, "utf8")).trim();
    }

    if (!finalText) {
      finalText = parseCodexFinalText(result.stdout);
    }

    if (!finalText && !stdoutHasStructuredEvents(result.stdout)) {
      finalText = result.stdout.trim();
    }

    if (!finalText) {
      throw new Error("Codex completed without a final response");
    }

    return { text: finalText, usage };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function buildCodexArgs({ outputPath, workspaceDir, model = "", extraArgs = [] }) {
  const args = [
    "-a",
    "never",
    "-s",
    "read-only",
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "--json",
    "--output-last-message",
    outputPath
  ];

  if (model) {
    args.push("-m", model);
  }

  args.push(...extraArgs, "-C", workspaceDir, "-");
  return args;
}

export function parseCodexUsage(stdout) {
  let usage = null;

  for (const event of parseJsonLineObjects(stdout)) {
    if (event.type === "turn.completed" && event.usage && typeof event.usage === "object") {
      usage = normalizeUsage(event.usage);
    }
  }

  return usage;
}

function parseCodexFinalText(stdout) {
  let text = "";

  for (const event of parseJsonLineObjects(stdout)) {
    if (
      event.type === "item.completed" &&
      event.item?.type === "agent_message" &&
      typeof event.item.text === "string"
    ) {
      text = event.item.text.trim();
    }
  }

  return text;
}

function stdoutHasStructuredEvents(stdout) {
  return parseJsonLineObjects(stdout).some((event) => typeof event.type === "string");
}

function parseJsonLineObjects(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function normalizeUsage(usage) {
  const inputTokens = numberOrZero(usage.input_tokens);
  const cachedInputTokens = numberOrZero(usage.cached_input_tokens);
  const outputTokens = numberOrZero(usage.output_tokens);
  const reasoningOutputTokens = numberOrZero(usage.reasoning_output_tokens);

  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    total_tokens: inputTokens + outputTokens
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function readBooleanConfig(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  return fallback;
}

function spawnCodex(command, args, stdin, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_500).unref();
      reject(new Error(`Codex timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const detail = stderr.trim() || stdout.trim() || `signal ${signal || "unknown"}`;
      reject(new Error(`Codex failed with exit code ${code}: ${detail}`));
    });

    child.stdin.end(stdin);
  });
}
