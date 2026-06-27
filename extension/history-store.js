(function attachHistoryStore(global) {
  const STORAGE_KEY = "codexSelectionHistoryV1";
  const MAX_RECORDS_PER_URL = 200;

  function createEmptyHistoryState() {
    return {
      version: 1,
      urls: {}
    };
  }

  function createUrlKey(value) {
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }

    try {
      const url = new URL(value);
      url.hash = "";
      return url.toString();
    } catch {
      return value.split("#")[0];
    }
  }

  function buildHistoryRecord({
    id = createRecordId(),
    now = new Date().toISOString(),
    selection = "",
    question = "",
    answer = "",
    context = {},
    anchor = {},
    usage = null
  }) {
    const url = context.url || "";
    const normalizedAnchor = {
      exactText: String(anchor.exactText || selection || ""),
      prefixText: String(anchor.prefixText || ""),
      suffixText: String(anchor.suffixText || "")
    };

    return {
      id,
      threadId: id,
      urlKey: createUrlKey(url),
      url,
      title: context.tabTitle || context.title || "",
      selectionText: String(selection || ""),
      question: String(question || ""),
      answer: String(answer || ""),
      createdAt: now,
      updatedAt: now,
      anchorKey: createAnchorKey(normalizedAnchor),
      anchor: normalizedAnchor,
      contextSnapshot: clonePlainObject(context),
      messages: buildInitialMessages({
        now,
        question,
        answer,
        usage
      })
    };
  }

  function appendThreadTurn(record, {
    now = new Date().toISOString(),
    question = "",
    answer = "",
    usage = null
  } = {}) {
    const normalized = normalizeRecord(record);
    const nextMessages = [
      ...normalized.messages,
      buildThreadMessage({ role: "user", text: question, createdAt: now }),
      buildThreadMessage({ role: "assistant", text: answer, createdAt: now, usage })
    ].filter((message) => message.text);

    return {
      ...normalized,
      question: String(question || ""),
      answer: String(answer || ""),
      updatedAt: now,
      messages: nextMessages
    };
  }

  function addRecordToState(state, record) {
    const next = normalizeHistoryState(state);
    const normalizedRecord = normalizeRecord(record);
    const urlKey = normalizedRecord.urlKey || createUrlKey(normalizedRecord.url);

    if (!urlKey) {
      return next;
    }

    const existing = next.urls[urlKey]?.records || [];
    const records = [
      { ...normalizedRecord, urlKey },
      ...existing.filter((entry) => entry.id !== normalizedRecord.id)
    ].slice(0, MAX_RECORDS_PER_URL);

    next.urls[urlKey] = { records };
    return next;
  }

  function appendThreadTurnToState(state, urlOrKey, threadId, turn) {
    const next = normalizeHistoryState(state);
    const urlKey = next.urls[urlOrKey] ? urlOrKey : createUrlKey(urlOrKey);
    const bucket = next.urls[urlKey];

    if (!bucket || !threadId) {
      return next;
    }

    let updatedRecord = null;
    const remaining = [];

    for (const record of bucket.records) {
      if (record.id === threadId || record.threadId === threadId) {
        updatedRecord = appendThreadTurn(record, turn);
        continue;
      }

      remaining.push(record);
    }

    if (!updatedRecord) {
      return next;
    }

    next.urls[urlKey] = {
      records: [updatedRecord, ...remaining].slice(0, MAX_RECORDS_PER_URL)
    };
    return next;
  }

  function getRecordForUrl(state, urlOrKey, recordId, options = {}) {
    const normalized = normalizeHistoryState(state);
    const direct = normalized.urls[urlOrKey]?.records;
    const records = direct || normalized.urls[createUrlKey(urlOrKey)]?.records || [];
    return records.find((record) => {
      if (!options.includeDeleted && record.deletedAt) {
        return false;
      }

      return record.id === recordId || record.threadId === recordId;
    }) || null;
  }

  function listRecordsForUrl(state, urlOrKey, options = {}) {
    const normalized = normalizeHistoryState(state);
    const direct = normalized.urls[urlOrKey]?.records;
    const records = direct || normalized.urls[createUrlKey(urlOrKey)]?.records || [];

    if (options.includeDeleted) {
      return [...records];
    }

    return records.filter((record) => !record.deletedAt);
  }

  function softDeleteRecordFromState(
    state,
    urlOrKey,
    recordId,
    now = new Date().toISOString()
  ) {
    const next = normalizeHistoryState(state);
    const urlKey = next.urls[urlOrKey] ? urlOrKey : createUrlKey(urlOrKey);
    const bucket = next.urls[urlKey];

    if (!bucket || !recordId) {
      return next;
    }

    next.urls[urlKey] = {
      records: bucket.records.map((record) => {
        if (record.id !== recordId || record.deletedAt) {
          return record;
        }

        return {
          ...record,
          deletedAt: now
        };
      })
    };

    return next;
  }

  async function saveHistoryRecord(storage, record) {
    const state = await readHistoryState(storage);
    const next = addRecordToState(state, record);
    await storageSet(storage, { [STORAGE_KEY]: next });
    return record;
  }

  async function readHistoryForUrl(storage, url) {
    const state = await readHistoryState(storage);
    return listRecordsForUrl(state, createUrlKey(url));
  }

  async function softDeleteHistoryRecord(storage, url, recordId) {
    const state = await readHistoryState(storage);
    const next = softDeleteRecordFromState(state, url, recordId);
    await storageSet(storage, { [STORAGE_KEY]: next });
    return listRecordsForUrl(next, url);
  }

  async function appendThreadTurnInStorage(storage, url, threadId, turn) {
    const state = await readHistoryState(storage);
    const next = appendThreadTurnToState(state, url, threadId, turn);
    await storageSet(storage, { [STORAGE_KEY]: next });
    return getRecordForUrl(next, url, threadId);
  }

  async function readHistoryState(storage) {
    const result = await storageGet(storage, STORAGE_KEY);
    return normalizeHistoryState(result?.[STORAGE_KEY]);
  }

  function normalizeHistoryState(state) {
    if (!state || typeof state !== "object") {
      return createEmptyHistoryState();
    }

    const urls = {};
    for (const [urlKey, bucket] of Object.entries(state.urls || {})) {
      urls[urlKey] = {
        records: Array.isArray(bucket?.records)
          ? bucket.records.map((record) => normalizeRecord(record))
          : []
      };
    }

    return {
      version: 1,
      urls
    };
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== "object") {
      return buildHistoryRecord({});
    }

    const id = String(record.id || record.threadId || createRecordId());
    const createdAt = String(record.createdAt || new Date().toISOString());
    const updatedAt = String(record.updatedAt || createdAt);
    const selectionText = String(record.selectionText || record.anchor?.exactText || "");
    const contextSnapshot = normalizeContextSnapshot(record);
    const anchor = {
      exactText: String(record.anchor?.exactText || selectionText),
      prefixText: String(record.anchor?.prefixText || ""),
      suffixText: String(record.anchor?.suffixText || "")
    };
    const messages = normalizeMessages(record.messages, {
      createdAt,
      question: record.question,
      answer: record.answer
    });

    return {
      ...record,
      id,
      threadId: String(record.threadId || id),
      urlKey: record.urlKey || createUrlKey(record.url || contextSnapshot.url),
      url: String(record.url || contextSnapshot.url || ""),
      title: String(record.title || contextSnapshot.tabTitle || contextSnapshot.title || ""),
      selectionText,
      question: String(record.question || latestMessageText(messages, "user")),
      answer: String(record.answer || latestMessageText(messages, "assistant")),
      createdAt,
      updatedAt,
      anchorKey: record.anchorKey || createAnchorKey(anchor),
      anchor,
      contextSnapshot,
      messages
    };
  }

  function normalizeContextSnapshot(record) {
    const snapshot = clonePlainObject(record.contextSnapshot || {});

    if (!snapshot.url && record.url) {
      snapshot.url = String(record.url);
    }
    if (!snapshot.title && record.title) {
      snapshot.title = String(record.title);
    }
    if (!snapshot.tabTitle && record.title) {
      snapshot.tabTitle = String(record.title);
    }

    return snapshot;
  }

  function buildInitialMessages({ now, question, answer, usage = null }) {
    return [
      buildThreadMessage({ role: "user", text: question, createdAt: now }),
      buildThreadMessage({ role: "assistant", text: answer, createdAt: now, usage })
    ].filter((message) => message.text);
  }

  function normalizeMessages(messages, fallback) {
    if (Array.isArray(messages) && messages.length) {
      return messages
        .map((message) => buildThreadMessage({
          id: message.id,
          role: message.role,
          text: message.text,
          createdAt: message.createdAt,
          usage: message.usage
        }))
        .filter((message) => message.text);
    }

    return buildInitialMessages({
      now: fallback.createdAt,
      question: fallback.question,
      answer: fallback.answer,
      usage: fallback.usage
    });
  }

  function buildThreadMessage({ id = createMessageId(), role, text, createdAt, usage }) {
    const normalizedRole = role === "assistant" ? "assistant" : "user";
    const message = {
      id,
      role: normalizedRole,
      text: String(text || ""),
      createdAt: String(createdAt || new Date().toISOString())
    };

    if (usage && typeof usage === "object") {
      message.usage = clonePlainObject(usage);
    }

    return message;
  }

  function latestMessageText(messages, role) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === role) {
        return messages[index].text;
      }
    }

    return "";
  }

  function createRecordId() {
    const random =
      global.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `hist_${random}`;
  }

  function createMessageId() {
    const random =
      global.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `msg_${random}`;
  }

  function createAnchorKey(anchor) {
    return hashString(
      [
        normalizeForKey(anchor.exactText),
        normalizeForKey(anchor.prefixText),
        normalizeForKey(anchor.suffixText)
      ].join("\n")
    );
  }

  function normalizeForKey(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function hashString(value) {
    let hash = 2166136261;
    let reverseHash = 2166136261;

    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    for (let index = value.length - 1; index >= 0; index -= 1) {
      reverseHash ^= value.charCodeAt(index);
      reverseHash = Math.imul(reverseHash, 16777619);
    }

    return `a_${(hash >>> 0).toString(36)}_${(reverseHash >>> 0).toString(36)}`;
  }

  function clonePlainObject(value) {
    if (!value || typeof value !== "object") {
      return {};
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return {};
    }
  }

  function storageGet(storage, key) {
    return new Promise((resolve, reject) => {
      try {
        storage.get(key, (result) => {
          const error = global.chrome?.runtime?.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(result || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageSet(storage, value) {
    return new Promise((resolve, reject) => {
      try {
        storage.set(value, () => {
          const error = global.chrome?.runtime?.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  global.CodexSelectionHistoryStore = {
    STORAGE_KEY,
    addRecordToState,
    appendThreadTurn,
    appendThreadTurnInStorage,
    appendThreadTurnToState,
    buildHistoryRecord,
    createEmptyHistoryState,
    createUrlKey,
    getRecordForUrl,
    listRecordsForUrl,
    readHistoryState,
    readHistoryForUrl,
    saveHistoryRecord,
    softDeleteHistoryRecord,
    softDeleteRecordFromState
  };
})(globalThis);
