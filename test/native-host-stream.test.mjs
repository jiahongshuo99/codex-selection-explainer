import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";

import { decodeMessages, encodeMessage } from "../native-host/protocol.mjs";

function waitForNativeResponse(child, timeoutMs = 750) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for native host response before stdin closed"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);

      try {
        const messages = decodeMessages(Buffer.concat(stdout));

        if (messages.length > 0) {
          clearTimeout(timer);
          resolve(messages[0]);
        }
      } catch {
        // Keep waiting until a full native messaging frame arrives.
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(Buffer.concat(stderr).toString("utf8") || `Host exited with ${code}`));
      }
    });
  });
}

describe("native host stream handling", () => {
  it("responds to a complete message before stdin closes", async () => {
    const child = spawn(process.execPath, ["native-host/index.mjs"], {
      cwd: new URL("..", import.meta.url),
      stdio: ["pipe", "pipe", "pipe"]
    });

    try {
      child.stdin.write(encodeMessage({ type: "ping" }));
      const response = await waitForNativeResponse(child);

      assert.equal(response.ok, true);
      assert.equal(response.type, "pong");
    } finally {
      child.kill("SIGTERM");
    }
  });
});
