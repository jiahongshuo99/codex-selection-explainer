# Codex Selection Explainer

Chrome MV3 插件。选中网页文字后，插件在页面里显示一个小对话框，通过 Native Messaging 调用本机 Codex CLI，基于划线内容和页面上下文生成解释。

## 项目结构

- `extension/`: Chrome 插件源码。
- `native-host/`: Native Messaging host，负责调用 `codex exec`。
- `scripts/install-host.mjs`: 写入 Chrome native host manifest。

## 安装

```bash
cd /Users/jiahongshuo/Repos/codex-selection-explainer
npm run install-host
```

然后打开 Chrome：

1. 访问 `chrome://extensions`。
2. 打开开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `/Users/jiahongshuo/Repos/codex-selection-explainer/extension`。

安装脚本会打印插件 ID。这个 ID 来自 `extension/manifest.json` 里的固定 public key，所以后续重新加载扩展也会稳定。

## 使用

1. 在普通网页里选中文字。
2. 点击选区旁边浮出的 Codex 图标。
3. 在小对话框里输入问题，或直接使用默认的“解释这段内容”。
4. 点击发送，插件会把选区、URL、标签页标题、页面标题、canonical、meta description、标题层级、面包屑、选区附近正文、页面正文片段、选区元素路径等上下文发给本地 Codex CLI。

解释框支持 LaTeX 数学公式渲染，包括 `\(...\)` 行内公式、`\[...\]` 块级公式和 `$$...$$` 块级公式。KaTeX 资源随扩展本地加载，不依赖 CDN。

点击图标后，页面原生选区可能会因为输入框交互而失焦；插件会同时绘制一层轻量高亮，保留“刚才选了哪里”的视觉状态，直到关闭对话框。

每次解释成功后，插件会把这次划线内容、问题、回答和文本锚点保存到 Chrome 本地存储。后续打开同一个 URL 时，能重新定位到已解释过的文字并在下面画一条持久下划线。点击下划线会显示这个划线内容关联的 QA 短列表，再点击某条 QA 可以打开完整历史对话框。

插件不能运行在 `chrome://`、Chrome Web Store 等不允许内容脚本注入的页面。

## 自检

```bash
cd /Users/jiahongshuo/Repos/codex-selection-explainer
npm run check-host
npm test
```

也可以点击插件图标，在弹窗里点“检查本地桥”。

如果页面弹窗显示 `Native host has exited.`，先重新运行：

```bash
npm run install-host
```

安装脚本会把当前 Node.js 的绝对路径写入 `native-host/run.sh`。这是必要的，因为 Chrome 从图形界面启动 native host 时通常没有终端里的 Homebrew 或 nvm `PATH`。

如果页面弹窗一直停在 `Codex 正在解释...`，先确认代码是最新版本，然后刷新扩展和页面：

1. 打开 `chrome://extensions`。
2. 点击 `Codex Selection Explainer` 卡片上的刷新按钮。
3. 刷新正在使用的网页。
4. 再次划线发送。

这个插件的 native host 会在收到一条完整消息后立即处理，不需要等 Chrome 关闭 stdin。

## 配置

默认 Codex CLI 路径是：

```text
/Applications/Codex.app/Contents/Resources/codex
```

如需覆盖，复制配置文件：

```bash
cp native-host/config.example.json native-host/config.json
```

可配置字段：

- `codexPath`: Codex CLI 路径。
- `model`: 传给 `codex exec -m` 的模型名；留空使用 Codex 默认配置。
- `timeoutMs`: 单次解释超时时间。
- `workspaceDir`: Codex 的运行工作目录；留空使用项目内 `.codex-browser-workspace/`。
- `usageLogEnabled`: 是否记录每次解释调用的用量元数据；默认开启。
- `usageLogPath`: 用量日志路径；留空使用 `native-host/usage.jsonl`。
- `extraArgs`: 追加给 `codex exec` 的参数。

也可以用环境变量临时覆盖：

```bash
CODEX_SELECTION_EXPLAINER_CODEX_PATH=/path/to/codex npm run check-host
CODEX_SELECTION_EXPLAINER_MODEL=gpt-5 npm run check-host
CODEX_SELECTION_EXPLAINER_USAGE_LOG_ENABLED=false npm run check-host
CODEX_SELECTION_EXPLAINER_USAGE_LOG_PATH=/tmp/codex-selection-usage.jsonl npm run check-host
```

## 用量日志

Native host 默认会把每次解释调用追加写入：

```text
/Users/jiahongshuo/Repos/codex-selection-explainer/native-host/usage.jsonl
```

每行是一条 JSON 记录，包含调用时间、是否成功、页面 `host` / `origin`、选区/问题/上下文/prompt 字符数、耗时，以及 Codex `turn.completed` 返回的 token 用量。

日志不会保存划线原文、页面正文、页面标题、标签页标题，也不会保存完整 URL path 或 query。

## 安全边界

- 插件只允许连接 native host `com.local.codex_selection_explainer`。
- Native host manifest 只白名单当前插件 ID。
- Host 使用 `spawn` 参数数组调用 Codex，不经 shell 拼接命令。
- Host 对选区和上下文做长度限制。
- Codex 调用使用 `--ephemeral`、`--skip-git-repo-check`、`-a never` 和 `-s read-only`。
- 浏览器端历史记录保存在 `chrome.storage.local`，不会同步到远端账号。
