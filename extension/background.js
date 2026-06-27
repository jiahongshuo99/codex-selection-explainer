importScripts("history-store.js");

const HOST_NAME = "com.local.codex_selection_explainer";
const historyStore = globalThis.CodexSelectionHistoryStore;

function sendNative(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }

      resolve(response || { ok: false, error: "Native host returned an empty response" });
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.type === "codex-selection-explain") {
    explainAndSaveHistory(message).then(sendResponse);
    return true;
  }

  if (message.type === "codex-selection-history-list") {
    historyStore
      .readHistoryForUrl(chrome.storage.local, message.url)
      .then((records) => sendResponse({ ok: true, records }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  if (message.type === "codex-selection-history-delete") {
    historyStore
      .softDeleteHistoryRecord(chrome.storage.local, message.url, message.recordId)
      .then((records) => sendResponse({ ok: true, records }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  if (message.type === "codex-selection-ping") {
    sendNative({ type: "ping" }).then(sendResponse);
    return true;
  }

  return false;
});

async function explainAndSaveHistory(message) {
  const response = await sendNative({
    type: "explain",
    question: message.question,
    selection: message.selection,
    context: message.context
  });

  if (!response?.ok) {
    return response;
  }

  const record = historyStore.buildHistoryRecord({
    selection: message.selection,
    question: message.question,
    answer: response.text || "",
    context: message.context,
    anchor: message.anchor
  });

  try {
    await historyStore.saveHistoryRecord(chrome.storage.local, record);
    return { ...response, historyRecord: record };
  } catch (error) {
    return {
      ...response,
      historyWarning: error instanceof Error ? error.message : String(error)
    };
  }
}
