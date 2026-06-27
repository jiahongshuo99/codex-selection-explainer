import assert from "node:assert/strict";
import { describe, it } from "node:test";

await import("../extension/runtime-utils.js");

const runtimeUtils = globalThis.CodexSelectionRuntimeUtils;

describe("runtime utilities", () => {
  it("reports an invalid extension context when runtime access throws", () => {
    const runtime = {
      get id() {
        throw new Error("Extension context invalidated.");
      }
    };

    assert.equal(runtimeUtils.isExtensionContextAvailable(runtime), false);
  });

  it("turns synchronous sendMessage failures into a user-facing response", async () => {
    const response = await runtimeUtils.sendRuntimeMessageSafe(
      { type: "codex-selection-history-list" },
      {
        sendMessage() {
          throw new Error("Extension context invalidated.");
        }
      }
    );

    assert.deepEqual(response, {
      ok: false,
      error: "扩展已重新加载，请刷新当前网页后再试。"
    });
  });
});
