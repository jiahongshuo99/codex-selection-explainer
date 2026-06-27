(() => {
  const ACTION_ID = "codex-selection-explainer-action";
  const DIALOG_ID = "codex-selection-explainer-dialog";
  const HISTORY_MARKERS_ID = "codex-selection-explainer-history";
  const HISTORY_POPOVER_ID = "codex-selection-explainer-history-popover";
  const MAX_SELECTION_LENGTH = 12_000;

  let selectionSnapshot = null;
  let actionButton = null;
  let dialog = null;
  let pageHistoryRecords = [];
  let renderHistoryFrame = 0;
  const contextUtils = globalThis.CodexSelectionContextUtils;
  const highlightUtils = globalThis.CodexSelectionHighlight;
  const dialogUtils = globalThis.CodexSelectionDialogUtils;
  const renderMath = globalThis.CodexSelectionRenderMath;
  const anchorUtils = globalThis.CodexSelectionAnchorUtils;
  const runtimeUtils = globalThis.CodexSelectionRuntimeUtils;

  loadPageHistory();

  document.addEventListener("mouseup", () => {
    setTimeout(handleSelectionChange, 20);
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") {
      closeDialog();
      removeActionButton();
      return;
    }

    handleSelectionChange();
  });

  document.addEventListener(
    "scroll",
    () => {
      removeActionButton();
      scheduleRenderHistoryMarkers();
    },
    true
  );
  window.addEventListener("resize", handleViewportResize);
  window.visualViewport?.addEventListener("resize", handleViewportResize);
  window.visualViewport?.addEventListener("scroll", handleViewportResize);
  window.addEventListener("pageshow", loadPageHistory);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      loadPageHistory();
    }
  });
  document.addEventListener("mousedown", (event) => {
    if (!event.target.closest(`#${HISTORY_POPOVER_ID}`)) {
      removeHistoryPopover();
    }
  });

  function handleSelectionChange() {
    const snapshot = readSelectionSnapshot();

    if (!snapshot) {
      removeActionButton();
      return;
    }

    selectionSnapshot = snapshot;
    showActionButton(snapshot.rect);
  }

  function readSelectionSnapshot() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const text = selection.toString().trim();

    if (!text) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rect = getRangeRect(range);
    const container = getElement(range.commonAncestorContainer);
    const anchor = anchorUtils.buildTextAnchorFromRange(range, document.body);

    if (!rect) {
      return null;
    }

    return {
      selection: truncate(text, MAX_SELECTION_LENGTH),
      rect,
      highlightRects: highlightUtils.getRangeHighlightRects(range, window),
      anchor,
      context: collectContext(range, container)
    };
  }

  function getRangeRect(range) {
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0
    );
    const rect = rects[0] || range.getBoundingClientRect();

    if (!rect || rect.width === 0 || rect.height === 0) {
      return null;
    }

    return {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      bottom: rect.bottom + window.scrollY,
      right: rect.right + window.scrollX
    };
  }

  function getElement(node) {
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  }

  function collectContext(_range, container) {
    const block = contextUtils.findContextBlock(container, document);

    return contextUtils.collectPageContext({
      document,
      location,
      navigator,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      container,
      block
    });
  }

  function showActionButton(rect) {
    removeActionButton();
    actionButton = document.createElement("button");
    actionButton.id = ACTION_ID;
    actionButton.type = "button";
    actionButton.setAttribute("aria-label", "用 Codex 解释划线内容");
    actionButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M15.8 6.4A6.7 6.7 0 1 0 16 17.5" />
        <path d="M18.5 4.8v3.4M16.8 6.5h3.4" />
      </svg>
    `;
    actionButton.title = "用 Codex 解释划线内容";
    applyActionButtonSize(actionButton);
    positionActionButton(actionButton, rect);
    actionButton.addEventListener("mousedown", (event) => event.preventDefault());
    actionButton.addEventListener("click", () => showDialog(rect));
    document.documentElement.append(actionButton);
  }

  function removeActionButton() {
    document.querySelectorAll(`#${ACTION_ID}`).forEach((button) => button.remove());
    actionButton = null;
  }

  function showDialog(rect) {
    removeActionButton();
    removeDialogElement();

    if (!runtimeUtils.isExtensionContextAvailable()) {
      showExtensionReloadDialog(rect);
      return;
    }

    highlightUtils.renderSelectionHighlight(selectionSnapshot?.highlightRects || [], document);

    dialog = document.createElement("section");
    dialog.id = DIALOG_ID;
    dialog.innerHTML = `
      <header data-drag-handle>
        <div class="codex-selection-explainer-brand">
          <span class="codex-selection-explainer-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M15.8 6.4A6.7 6.7 0 1 0 16 17.5" />
              <path d="M18.5 4.8v3.4M16.8 6.5h3.4" />
            </svg>
          </span>
          <strong>Codex</strong>
        </div>
        <button type="button" data-close title="关闭" aria-label="关闭">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
          </svg>
        </button>
      </header>
      <textarea rows="3" spellcheck="false">解释这段内容</textarea>
      <div class="codex-selection-explainer-actions">
        <button type="button" data-submit>发送</button>
      </div>
      <div class="codex-selection-explainer-output" data-output aria-live="polite"></div>
    `;

    dialog.style.left = "0px";
    dialog.style.top = "0px";
    dialog.style.visibility = "hidden";
    dialog.querySelector("[data-close]").addEventListener("click", closeDialog);
    dialog.querySelector("[data-submit]").addEventListener("click", submitQuestion);
    dialog.querySelector("textarea").addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        submitQuestion();
      }
    });
    document.documentElement.append(dialog);
    positionDialog(dialog, rect);
    enableDialogDrag(dialog, dialog.querySelector("[data-drag-handle]"));
    dialog.style.visibility = "";
  }

  function showExtensionReloadDialog(rect) {
    dialog = document.createElement("section");
    dialog.id = DIALOG_ID;
    dialog.innerHTML = `
      <header data-drag-handle>
        <div class="codex-selection-explainer-brand">
          <span class="codex-selection-explainer-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M15.8 6.4A6.7 6.7 0 1 0 16 17.5" />
              <path d="M18.5 4.8v3.4M16.8 6.5h3.4" />
            </svg>
          </span>
          <strong>Codex</strong>
        </div>
        <button type="button" data-close title="关闭" aria-label="关闭">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
          </svg>
        </button>
      </header>
      <div class="codex-selection-explainer-output" data-output></div>
    `;
    dialog.style.left = "0px";
    dialog.style.top = "0px";
    dialog.style.visibility = "hidden";
    dialog.querySelector("[data-close]").addEventListener("click", closeDialog);
    dialog.querySelector("[data-output]").textContent =
      runtimeUtils.EXTENSION_RELOAD_MESSAGE;
    document.documentElement.append(dialog);
    positionDialog(dialog, rect);
    enableDialogDrag(dialog, dialog.querySelector("[data-drag-handle]"));
    dialog.style.visibility = "";
  }

  async function submitQuestion() {
    if (!dialog || !selectionSnapshot) {
      return;
    }

    const submitButton = dialog.querySelector("[data-submit]");
    const output = dialog.querySelector("[data-output]");
    const question = dialog.querySelector("textarea").value.trim() || "解释这段内容";
    submitButton.disabled = true;
    output.textContent = "Codex 正在解释...";

    runtimeUtils
      .sendRuntimeMessageSafe(
      {
        type: "codex-selection-explain",
        question,
        selection: selectionSnapshot.selection,
        context: selectionSnapshot.context,
        anchor: selectionSnapshot.anchor
      }
    )
      .then((response) => {
        submitButton.disabled = false;

        if (!response?.ok) {
          output.textContent = `调用失败：${response?.error || "未知错误"}`;
          return;
        }

        renderMath.renderTextWithMath(output, response.text || "Codex 没有返回内容。");

        if (response.historyRecord) {
          upsertPageHistoryRecord(response.historyRecord);
          scheduleRenderHistoryMarkers();
        }
      });
  }

  function closeDialog() {
    removeDialogElement();
    highlightUtils.clearSelectionHighlight(document);
  }

  function removeDialogElement() {
    document.querySelectorAll(`#${DIALOG_ID}`).forEach((element) => element.remove());
    dialog = null;
  }

  function loadPageHistory() {
    runtimeUtils
      .sendRuntimeMessageSafe(
      {
        type: "codex-selection-history-list",
        url: location.href
      }
    )
      .then((response) => {
        if (!response?.ok) {
          return;
        }

        pageHistoryRecords = Array.isArray(response.records) ? response.records : [];
        renderHistoryMarkersNow();
      });
  }

  function upsertPageHistoryRecord(record) {
    pageHistoryRecords = [
      record,
      ...pageHistoryRecords.filter((entry) => entry.id !== record.id)
    ];
  }

  function scheduleRenderHistoryMarkers() {
    if (renderHistoryFrame) {
      return;
    }

    renderHistoryFrame = requestAnimationFrame(() => {
      renderHistoryFrame = 0;
      renderHistoryMarkers();
    });
  }

  function renderHistoryMarkersNow() {
    if (renderHistoryFrame) {
      cancelAnimationFrame(renderHistoryFrame);
      renderHistoryFrame = 0;
    }

    renderHistoryMarkers();
  }

  function handleViewportResize() {
    scheduleRenderHistoryMarkers();
    clampOpenFloatingElements();
  }

  function clampOpenFloatingElements() {
    for (const element of [
      document.getElementById(DIALOG_ID),
      document.getElementById(HISTORY_POPOVER_ID)
    ]) {
      if (!element) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      positionFloatingElement(element, rect.left, rect.top);
    }
  }

  function renderHistoryMarkers() {
    removeHistoryMarkers();

    if (!pageHistoryRecords.length) {
      return;
    }

    const root = document.createElement("div");
    root.id = HISTORY_MARKERS_ID;
    root.setAttribute("aria-hidden", "true");

    const renderedAnchorKeys = new Set();

    for (const record of pageHistoryRecords) {
      if (renderedAnchorKeys.has(record.anchorKey)) {
        continue;
      }

      const range = anchorUtils.findAnchorRange(document, record.anchor);

      if (!range) {
        continue;
      }

      renderedAnchorKeys.add(record.anchorKey);

      for (const rect of highlightUtils.getRangeHighlightRects(range, window)) {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "codex-selection-explainer-history-marker";
        marker.dataset.recordId = record.id;
        marker.title = "查看 Codex 历史解释";
        marker.style.top = `${rect.top + rect.height - 4}px`;
        marker.style.left = `${rect.left}px`;
        marker.style.width = `${rect.width}px`;
        marker.style.height = "7px";
        marker.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          showHistoryPopover(record.id, event.clientX, event.clientY);
        });
        root.append(marker);
      }
    }

    document.documentElement.append(root);
  }

  function removeHistoryMarkers() {
    document.getElementById(HISTORY_MARKERS_ID)?.remove();
  }

  function showHistoryPopover(recordId, viewportX, viewportY) {
    removeHistoryPopover();

    const record = pageHistoryRecords.find((entry) => entry.id === recordId);
    if (!record) {
      return;
    }

    const group = pageHistoryRecords
      .filter((entry) => entry.anchorKey === record.anchorKey)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const popover = document.createElement("section");
    popover.id = HISTORY_POPOVER_ID;
    popover.innerHTML = `
      <div class="codex-selection-explainer-history-title"></div>
      <div class="codex-selection-explainer-history-list"></div>
    `;
    popover.querySelector(".codex-selection-explainer-history-title").textContent =
      truncateMiddle(record.selectionText || record.anchor?.exactText || "历史解释", 72);
    const list = popover.querySelector(".codex-selection-explainer-history-list");

    for (const entry of group) {
      const item = document.createElement("div");
      item.className = "codex-selection-explainer-history-item";
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "codex-selection-explainer-history-open";
      openButton.innerHTML = `
        <span data-question></span>
        <small data-answer></small>
      `;
      openButton.querySelector("[data-question]").textContent = entry.question || "解释这段内容";
      openButton.querySelector("[data-answer]").textContent = truncateMiddle(entry.answer || "", 96);
      openButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeHistoryPopover();
        showHistoryDialog(entry, viewportX, viewportY);
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "codex-selection-explainer-history-delete";
      deleteButton.title = "删除这条问答记录";
      deleteButton.setAttribute("aria-label", "删除这条问答记录");
      deleteButton.innerHTML = `
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M7 5V3.8h6V5" />
          <path d="M4.8 5h10.4" />
          <path d="M6.2 7.2 6.8 16h6.4l.6-8.8" />
          <path d="M9 8.8v5.4M11 8.8v5.4" />
        </svg>
      `;
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteHistoryRecord(entry.id, {
          anchorKey: entry.anchorKey,
          viewportX,
          viewportY,
          sourceElement: deleteButton
        });
      });
      item.append(openButton, deleteButton);
      list.append(item);
    }

    document.documentElement.append(popover);
    positionFloatingElement(popover, viewportX + 8, viewportY + 8);
  }

  function removeHistoryPopover() {
    document.getElementById(HISTORY_POPOVER_ID)?.remove();
  }

  function showHistoryDialog(record, viewportX, viewportY) {
    removeActionButton();
    removeDialogElement();
    highlightUtils.clearSelectionHighlight(document);

    dialog = document.createElement("section");
    dialog.id = DIALOG_ID;
    dialog.className = "codex-selection-explainer-history-dialog";
    dialog.innerHTML = `
      <header data-drag-handle>
        <div class="codex-selection-explainer-brand">
          <span class="codex-selection-explainer-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M15.8 6.4A6.7 6.7 0 1 0 16 17.5" />
              <path d="M18.5 4.8v3.4M16.8 6.5h3.4" />
            </svg>
          </span>
          <strong>Codex History</strong>
        </div>
        <div class="codex-selection-explainer-header-actions">
          <button type="button" data-delete-history title="删除这条问答记录" aria-label="删除这条问答记录">
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M7 5V3.8h6V5" />
              <path d="M4.8 5h10.4" />
              <path d="M6.2 7.2 6.8 16h6.4l.6-8.8" />
              <path d="M9 8.8v5.4M11 8.8v5.4" />
            </svg>
          </button>
          <button type="button" data-close title="关闭" aria-label="关闭">
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
            </svg>
          </button>
        </div>
      </header>
      <div class="codex-selection-explainer-history-block">
        <div class="codex-selection-explainer-history-block-header">
          <label>划线内容</label>
          <button type="button" data-toggle-selection aria-expanded="false">展开</button>
        </div>
        <div class="codex-selection-explainer-history-selection is-collapsed" data-selection></div>
      </div>
      <div class="codex-selection-explainer-history-block">
        <label>问题</label>
        <div data-question></div>
      </div>
      <div class="codex-selection-explainer-history-block">
        <label>回答</label>
        <div class="codex-selection-explainer-output codex-selection-explainer-history-answer" data-answer></div>
      </div>
    `;
    dialog.style.left = "0px";
    dialog.style.top = "0px";
    dialog.style.visibility = "hidden";
    dialog.querySelector("[data-close]").addEventListener("click", closeDialog);
    dialog.querySelector("[data-delete-history]").addEventListener("click", (event) => {
      deleteHistoryRecord(record.id, {
        closeDialog: true,
        sourceElement: event.currentTarget
      });
    });
    dialog.querySelector("[data-toggle-selection]").addEventListener("click", (event) => {
      toggleHistorySelection(dialog, event.currentTarget);
    });
    renderMath.renderTextWithMath(
      dialog.querySelector("[data-selection]"),
      record.selectionText || record.anchor?.exactText || ""
    );
    renderMath.renderTextWithMath(dialog.querySelector("[data-question]"), record.question || "");
    renderMath.renderTextWithMath(dialog.querySelector("[data-answer]"), record.answer || "");
    document.documentElement.append(dialog);
    positionFloatingElement(dialog, viewportX + 8, viewportY + 8);
    enableDialogDrag(dialog, dialog.querySelector("[data-drag-handle]"));
    dialog.style.visibility = "";
  }

  async function deleteHistoryRecord(recordId, options = {}) {
    if (options.sourceElement) {
      options.sourceElement.disabled = true;
    }

    const response = await runtimeUtils.sendRuntimeMessageSafe({
      type: "codex-selection-history-delete",
      url: location.href,
      recordId
    });

    if (!response?.ok) {
      if (options.sourceElement) {
        options.sourceElement.disabled = false;
      }
      showHistoryDeleteError(response?.error || "未知错误");
      return;
    }

    pageHistoryRecords = Array.isArray(response.records)
      ? response.records
      : pageHistoryRecords.filter((entry) => entry.id !== recordId);
    renderHistoryMarkersNow();

    if (options.closeDialog) {
      closeDialog();
      return;
    }

    if (options.anchorKey) {
      const nextRecord = pageHistoryRecords.find(
        (entry) => entry.anchorKey === options.anchorKey
      );

      if (nextRecord) {
        showHistoryPopover(nextRecord.id, options.viewportX, options.viewportY);
        return;
      }
    }

    removeHistoryPopover();
  }

  function showHistoryDeleteError(message) {
    const popover = document.getElementById(HISTORY_POPOVER_ID);
    const text = `删除失败：${message}`;

    if (popover) {
      let error = popover.querySelector("[data-delete-error]");
      if (!error) {
        error = document.createElement("div");
        error.className = "codex-selection-explainer-history-error";
        error.dataset.deleteError = "";
        popover.append(error);
      }
      error.textContent = text;
      return;
    }

    const output = dialog?.querySelector("[data-answer]") || dialog?.querySelector("[data-output]");
    if (output) {
      output.textContent = text;
    }
  }

  function toggleHistorySelection(dialogElement, toggleButton) {
    const selectionElement = dialogElement.querySelector("[data-selection]");
    const collapsed = selectionElement.classList.toggle("is-collapsed");

    toggleButton.setAttribute("aria-expanded", String(!collapsed));
    toggleButton.textContent = collapsed ? "展开" : "收起";
  }

  function positionFloatingElement(element, left, top) {
    const bounds = getVisibleViewportBounds();
    applyVisiblePopupBounds(element, bounds);
    const position = dialogUtils.clampDialogPosition({
      left,
      top,
      width: element.offsetWidth,
      height: element.offsetHeight,
      viewportLeft: bounds.left,
      viewportTop: bounds.top,
      viewportWidth: bounds.width,
      viewportHeight: bounds.height,
      margin: 8
    });

    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;
  }

  function applyActionButtonSize(button) {
    const size = dialogUtils.getScreenFixedCssPx(34, window);
    const iconSize = dialogUtils.getScreenFixedCssPx(20, window);
    button.style.setProperty("--codex-selection-explainer-action-size", `${size}px`);
    button.style.setProperty("--codex-selection-explainer-action-icon-size", `${iconSize}px`);
  }

  function positionActionButton(button, rect) {
    const size = dialogUtils.getScreenFixedCssPx(34, window);
    const position = dialogUtils.getActionButtonPosition({
      rect,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      buttonSize: size,
      margin: 8,
      gap: 8
    });

    button.style.left = `${position.left}px`;
    button.style.top = `${position.top}px`;
  }

  function positionDialog(dialogElement, rect) {
    const bounds = getVisibleViewportBounds();
    applyVisiblePopupBounds(dialogElement, bounds);
    const position = dialogUtils.getInitialFixedDialogPosition({
      rect,
      width: dialogElement.offsetWidth,
      height: dialogElement.offsetHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportLeft: bounds.left,
      viewportTop: bounds.top,
      viewportWidth: bounds.width,
      viewportHeight: bounds.height,
      margin: 8,
      gap: 10
    });

    dialogElement.style.left = `${position.left}px`;
    dialogElement.style.top = `${position.top}px`;
  }

  function applyVisiblePopupBounds(element, bounds = getVisibleViewportBounds()) {
    element.style.maxWidth = `${Math.max(0, bounds.width - 16)}px`;
    element.style.maxHeight = `${Math.max(0, bounds.height - 16)}px`;
  }

  function getVisibleViewportBounds() {
    const viewport = window.visualViewport;

    if (!viewport) {
      return {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight
      };
    }

    return {
      left: Number(viewport.offsetLeft) || 0,
      top: Number(viewport.offsetTop) || 0,
      width: Number(viewport.width) || window.innerWidth,
      height: Number(viewport.height) || window.innerHeight
    };
  }

  function enableDialogDrag(dialogElement, handleElement) {
    let dragState = null;

    handleElement.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        event.target.closest("[data-close], [data-delete-history]")
      ) {
        return;
      }

      const rect = dialogElement.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      dialogElement.classList.add("is-dragging");
      handleElement.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    handleElement.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      const bounds = getVisibleViewportBounds();
      const position = dialogUtils.clampDialogPosition({
        left: event.clientX - dragState.offsetX,
        top: event.clientY - dragState.offsetY,
        width: dialogElement.offsetWidth,
        height: dialogElement.offsetHeight,
        viewportLeft: bounds.left,
        viewportTop: bounds.top,
        viewportWidth: bounds.width,
        viewportHeight: bounds.height,
        margin: 8
      });

      dialogElement.style.left = `${position.left}px`;
      dialogElement.style.top = `${position.top}px`;
    });

    for (const type of ["pointerup", "pointercancel"]) {
      handleElement.addEventListener(type, (event) => {
        if (!dragState || event.pointerId !== dragState.pointerId) {
          return;
        }

        handleElement.releasePointerCapture?.(event.pointerId);
        dragState = null;
        dialogElement.classList.remove("is-dragging");
      });
    }
  }

  function truncate(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 7).trimEnd()}\n[已截断]`;
  }

  function truncateMiddle(text, maxLength) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }
})();
