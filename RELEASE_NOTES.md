# Release Notes

## 1.0.0 - 2026-06-27

First stable release of Codex Selection Explainer.

### Highlights

- Chrome MV3 extension for explaining selected web page text through the local Codex CLI.
- Native Messaging bridge that connects the browser extension to the local host process without a cloud proxy.
- Rich page-context collection, including URL, tab title, page title, canonical URL, meta description, headings, breadcrumbs, nearby text, related page text, selection rects, and element path.
- Floating Codex action button that preserves the user's visible selection after activation.
- Fixed-position Codex dialog that can be moved, resized, clamped to the visible viewport, and kept compact across page zoom levels.
- Response rendering with Markdown-like text handling and LaTeX math support for inline and display formulas.
- Persistent explanation history grouped by normalized URL, with durable text anchors that redraw underlines when the same page is reopened.
- History review UI for clicking an underlined passage, browsing its QA list, and reopening a past conversation.
- Soft delete for QA records; when all QA under a passage are deleted, the underline disappears from normal history views.
- Cross-platform setup scripts for macOS, Linux, and Windows, covering Chrome, Chromium, Chrome Canary, Edge, and Brave.
- Local Node.js launcher fallback through `CODEX_SELECTION_EXPLAINER_NODE_PATH` and generated `native-host/node-path.txt`.
- Local Codex configuration support through `native-host/config.json` and environment overrides.
- Metadata-only usage logging for timing, token usage, request sizes, and success/failure status without saving page text or selected content.
- Codex CLI execution defaults to ephemeral, read-only, no-approval mode.

### Setup

Run the platform setup script, then load the `extension/` directory as an unpacked browser extension:

```bash
bash scripts/setup-mac.sh
bash scripts/setup-linux.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
```
