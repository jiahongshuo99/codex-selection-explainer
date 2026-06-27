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

  if (
    message.type === "codex-selection-explain" ||
    message.type === "codex-selection-thread-message"
  ) {
    explainAndSaveThread(message).then(sendResponse);
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

async function explainAndSaveThread(message) {
  const state = await historyStore.readHistoryState(chrome.storage.local);
  const requestUrl = message.context?.url || message.url || "";
  const existingRecord = message.threadId
    ? historyStore.getRecordForUrl(state, requestUrl, message.threadId)
    : null;
  const selection = existingRecord?.selectionText || message.selection;
  const context = existingRecord?.contextSnapshot || message.context;
  const anchor = existingRecord?.anchor || message.anchor;
  const threadMessages = existingRecord?.messages || [];

  const response = await sendNative({
    type: "explain",
    question: message.question,
    selection,
    context,
    threadMessages
  });

  if (!response?.ok) {
    return response;
  }

  try {
    const record = existingRecord
      ? await historyStore.appendThreadTurnInStorage(chrome.storage.local, requestUrl, existingRecord.id, {
          question: message.question,
          answer: response.text || "",
          usage: response.usage || null
        })
      : await historyStore.saveHistoryRecord(
          chrome.storage.local,
          historyStore.buildHistoryRecord({
            selection,
            question: message.question,
            answer: response.text || "",
            context,
            anchor,
            usage: response.usage || null
          })
        );

    return { ...response, historyRecord: record };
  } catch (error) {
    return {
      ...response,
      historyWarning: error instanceof Error ? error.message : String(error)
    };
  }
}
