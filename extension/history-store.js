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
    anchor = {}
  }) {
    const url = context.url || "";
    const normalizedAnchor = {
      exactText: String(anchor.exactText || selection || ""),
      prefixText: String(anchor.prefixText || ""),
      suffixText: String(anchor.suffixText || "")
    };

    return {
      id,
      urlKey: createUrlKey(url),
      url,
      title: context.tabTitle || context.title || "",
      selectionText: String(selection || ""),
      question: String(question || ""),
      answer: String(answer || ""),
      createdAt: now,
      anchorKey: createAnchorKey(normalizedAnchor),
      anchor: normalizedAnchor
    };
  }

  function addRecordToState(state, record) {
    const next = normalizeHistoryState(state);
    const urlKey = record.urlKey || createUrlKey(record.url);

    if (!urlKey) {
      return next;
    }

    const existing = next.urls[urlKey]?.records || [];
    const records = [
      { ...record, urlKey },
      ...existing.filter((entry) => entry.id !== record.id)
    ].slice(0, MAX_RECORDS_PER_URL);

    next.urls[urlKey] = { records };
    return next;
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
        records: Array.isArray(bucket?.records) ? bucket.records : []
      };
    }

    return {
      version: 1,
      urls
    };
  }

  function createRecordId() {
    const random =
      global.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `hist_${random}`;
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
    buildHistoryRecord,
    createEmptyHistoryState,
    createUrlKey,
    listRecordsForUrl,
    readHistoryForUrl,
    saveHistoryRecord,
    softDeleteHistoryRecord,
    softDeleteRecordFromState
  };
})(globalThis);
