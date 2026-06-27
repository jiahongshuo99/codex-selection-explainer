(function attachDialogUtils(global) {
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  function getPageZoom(win = global) {
    const visualScale = Number(win.visualViewport?.scale);
    const viewportScale =
      Number(win.outerWidth) > 0 && Number(win.innerWidth) > 0
        ? Number(win.outerWidth) / Number(win.innerWidth)
        : 1;
    const scale = Math.max(
      Number.isFinite(visualScale) && visualScale > 0 ? visualScale : 1,
      Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1
    );

    return clamp(scale, MIN_ZOOM, MAX_ZOOM);
  }

  function getScreenFixedCssPx(screenPx, win = global) {
    return roundCssPx(Number(screenPx) / getPageZoom(win));
  }

  function getActionButtonPosition({
    rect,
    scrollX = 0,
    scrollY = 0,
    viewportWidth = 0,
    buttonSize = 34,
    margin = 8,
    gap = 8
  }) {
    const maxLeft = scrollX + viewportWidth - margin - buttonSize;
    const preferredLeft = rect.left + scrollX;

    return {
      left: roundCssPx(clamp(preferredLeft, scrollX + margin, maxLeft)),
      top: roundCssPx(Math.max(scrollY + margin, rect.bottom + scrollY + gap))
    };
  }

  function getInitialDialogPosition({
    rect,
    width,
    height,
    scrollX = 0,
    scrollY = 0,
    viewportWidth = 0,
    viewportHeight = 0,
    margin = 8,
    gap = 10
  }) {
    return clampDialogPosition({
      left: rect.left + scrollX,
      top: rect.bottom + scrollY + gap,
      width,
      height,
      scrollX,
      scrollY,
      viewportWidth,
      viewportHeight,
      margin
    });
  }

  function getInitialFixedDialogPosition({
    rect,
    width,
    height,
    scrollX = 0,
    scrollY = 0,
    viewportLeft = 0,
    viewportTop = 0,
    viewportWidth = 0,
    viewportHeight = 0,
    margin = 8,
    gap = 10
  }) {
    return clampDialogPosition({
      left: rect.left - scrollX,
      top: rect.bottom - scrollY + gap,
      width,
      height,
      viewportLeft,
      viewportTop,
      viewportWidth,
      viewportHeight,
      margin
    });
  }

  function clampDialogPosition({
    left,
    top,
    width,
    height,
    viewportLeft,
    viewportTop,
    scrollX = 0,
    scrollY = 0,
    viewportWidth = 0,
    viewportHeight = 0,
    margin = 8
  }) {
    const originLeft = Number.isFinite(Number(viewportLeft)) ? Number(viewportLeft) : scrollX;
    const originTop = Number.isFinite(Number(viewportTop)) ? Number(viewportTop) : scrollY;
    const minLeft = originLeft + margin;
    const minTop = originTop + margin;
    const maxLeft = originLeft + Math.max(margin, viewportWidth - width - margin);
    const maxTop = originTop + Math.max(margin, viewportHeight - height - margin);

    return {
      left: roundCssPx(clamp(left, minLeft, Math.max(minLeft, maxLeft))),
      top: roundCssPx(clamp(top, minTop, Math.max(minTop, maxTop)))
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function roundCssPx(value) {
    return Math.round(value * 100) / 100;
  }

  global.CodexSelectionDialogUtils = {
    clampDialogPosition,
    getActionButtonPosition,
    getInitialFixedDialogPosition,
    getInitialDialogPosition,
    getPageZoom,
    getScreenFixedCssPx
  };
})(globalThis);
