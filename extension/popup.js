const result = document.querySelector("#result");
const check = document.querySelector("#check");

check.addEventListener("click", () => {
  result.textContent = "检查中...";
  chrome.runtime.sendMessage({ type: "codex-selection-ping" }, (response) => {
    if (chrome.runtime.lastError) {
      result.textContent = `失败：${chrome.runtime.lastError.message}`;
      return;
    }

    if (!response?.ok) {
      result.textContent = `失败：${response?.error || "未知错误"}`;
      return;
    }

    result.textContent = `已连接\nCodex: ${response.codexPath}\nTimeout: ${response.timeoutMs} ms`;
  });
});
