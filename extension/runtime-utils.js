(function attachRuntimeUtils(global) {
  const EXTENSION_RELOAD_MESSAGE = "扩展已重新加载，请刷新当前网页后再试。";

  function isExtensionContextAvailable(runtime = global.chrome?.runtime) {
    try {
      return Boolean(runtime?.id && runtime?.sendMessage);
    } catch {
      return false;
    }
  }

  function sendRuntimeMessageSafe(message, runtime = global.chrome?.runtime) {
    return new Promise((resolve) => {
      if (!isExtensionContextAvailable(runtime)) {
        resolve({
          ok: false,
          error: EXTENSION_RELOAD_MESSAGE
        });
        return;
      }

      try {
        runtime.sendMessage(message, (response) => {
          const lastError = getLastRuntimeError(runtime);

          if (lastError) {
            resolve({
              ok: false,
              error: normalizeRuntimeError(lastError.message || String(lastError))
            });
            return;
          }

          resolve(response || { ok: false, error: "扩展没有返回内容。" });
        });
      } catch (error) {
        resolve({
          ok: false,
          error: normalizeRuntimeError(error instanceof Error ? error.message : String(error))
        });
      }
    });
  }

  function normalizeRuntimeError(message) {
    if (/extension context invalidated/i.test(message)) {
      return EXTENSION_RELOAD_MESSAGE;
    }

    return message || "扩展调用失败。";
  }

  function getLastRuntimeError(runtime) {
    try {
      return runtime?.lastError || null;
    } catch {
      return null;
    }
  }

  global.CodexSelectionRuntimeUtils = {
    EXTENSION_RELOAD_MESSAGE,
    isExtensionContextAvailable,
    normalizeRuntimeError,
    sendRuntimeMessageSafe
  };
})(globalThis);
