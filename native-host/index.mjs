#!/usr/bin/env node
import { buildPrompt } from "./prompt.mjs";
import { runCodexDetailed, loadHostConfig } from "./codex-runner.mjs";
import { encodeMessage, NativeMessageParser } from "./protocol.mjs";
import { appendUsageLog, buildUsageLogRecord } from "./usage-log.mjs";

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    throw new Error("Native message must be an object");
  }

  if (message.type === "ping") {
    const config = await loadHostConfig();
    return {
      type: "pong",
      ok: true,
      codexPath: config.codexPath,
      timeoutMs: config.timeoutMs
    };
  }

  if (message.type !== "explain") {
    throw new Error(`Unsupported message type: ${message.type || "unknown"}`);
  }

  const startedAt = Date.now();
  const prompt = buildPrompt(message);
  const config = await loadHostConfig();

  try {
    const result = await runCodexDetailed(prompt, config);
    const elapsedMs = Date.now() - startedAt;

    await writeUsageLog(
      config,
      buildUsageLogRecord({
        request: message,
        prompt,
        elapsedMs,
        usage: result.usage,
        ok: true
      })
    );

    return {
      type: "explainResult",
      ok: true,
      text: result.text,
      elapsedMs,
      usage: result.usage
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    await writeUsageLog(
      config,
      buildUsageLogRecord({
        request: message,
        prompt,
        elapsedMs,
        ok: false,
        errorType: getErrorType(error)
      })
    );
    throw error;
  }
}

async function main() {
  const parser = new NativeMessageParser();
  let queue = Promise.resolve();

  process.stdin.on("data", (chunk) => {
    let messages;

    try {
      messages = parser.push(chunk);
    } catch (error) {
      writeError(error);
      process.exitCode = 1;
      process.stdin.pause();
      return;
    }

    for (const message of messages) {
      queue = queue.then(() => respondToMessage(message));
    }
  });

  await new Promise((resolve) => process.stdin.on("end", resolve));
  await queue;
}

async function respondToMessage(message) {
  try {
    const response = await handleMessage(message);
    process.stdout.write(encodeMessage(response));
  } catch (error) {
    writeError(error);
  }
}

function writeError(error) {
  process.stdout.write(
    encodeMessage({
      type: "error",
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  );
}

async function writeUsageLog(config, record) {
  if (!config.usageLogEnabled || !config.usageLogPath) {
    return;
  }

  try {
    await appendUsageLog(config.usageLogPath, record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Usage log write failed: ${message}\n`);
  }
}

function getErrorType(error) {
  if (error instanceof Error) {
    return error.name || "Error";
  }

  return typeof error;
}

main().catch((error) => {
  writeError(error);
});
