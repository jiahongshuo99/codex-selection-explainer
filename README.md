# Codex Selection Explainer

一个 Chrome MV3 扩展：在网页里选中文字，点击浮出的 Codex 图标，就能把选区和页面上下文交给本机 Codex CLI，让 Codex 在页面内给出解释。

它的目标不是做一个云端划词翻译插件，而是把浏览器里的阅读现场和本地 Codex 能力接起来。插件负责采集选区、URL、标题、附近正文等上下文；Native Messaging host 负责在本机调用 `codex exec`；结果回到页面中的浮动对话框展示。

## 功能概览

- 选中文字后显示一个极简 Codex 浮动按钮。
- 点击按钮后打开可移动、可调整大小的浮动对话框。
- 对话框固定在当前可视窗口内，不随页面滚动跑走，也不会弹出到可见区域外。
- 自动附带页面基础信息和选区附近上下文，包括 URL、标签页标题、页面标题、canonical、meta description、标题层级、面包屑、附近正文、整页相关文本、选区元素路径等。
- 回答支持 LaTeX 数学公式渲染，覆盖 `\(...\)`、`\[...\]` 和 `$$...$$`。
- 每次解释成功后，会在本地保存划线内容、问题、回答和文本锚点。
- 再次打开同一 URL 时，已解释过的文字会显示细下划线；点击下划线可以回看相关 QA。
- 历史 QA 支持软删除。删掉某段划线下的全部 QA 后，这段历史划线也会消失。
- 插件弹窗里可以检查本地 Native Messaging 桥是否可用。

## 安装

要求：

- macOS、Windows 或 Linux
- Chrome、Chrome Canary、Edge 或 Brave
- Node.js 20+
- 本机已安装 Codex CLI

克隆或进入项目目录：

```bash
git clone <repo-url>
cd codex-selection-explainer
```

运行对应平台的一键脚本：

```bash
# macOS
bash scripts/setup-mac.sh

# Linux
bash scripts/setup-linux.sh
```

Windows 在 PowerShell 里运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
```

默认安装到 Google Chrome。其他浏览器可以显式指定：

```bash
bash scripts/setup-mac.sh --browser=edge
bash scripts/setup-linux.sh --browser=brave
npm run setup -- --browser=chrome-canary
```

Windows 示例：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 --browser=edge
```

脚本会做这些事：

- 生成 `native-host/run.sh` 或 `native-host/run.cmd`。
- 写入当前浏览器的 Native Messaging host manifest；Windows 会同时写入当前用户的注册表项。
- 保存当前 Node.js 可执行文件路径到 `native-host/node-path.txt`，作为 native host 启动时的本地 fallback。
- macOS 会执行 `launchctl setenv CODEX_SELECTION_EXPLAINER_NODE_PATH ...`；Windows 会写入当前用户的 `CODEX_SELECTION_EXPLAINER_NODE_PATH` 环境变量。
- 如果能找到 Codex CLI，并且本地还没有 `native-host/config.json`，会自动生成一份本机配置。
- 安装后会 ping 一次 native host，确认本地桥能启动。
- 打印稳定的扩展 ID 和需要加载的扩展目录。

然后在 Chrome 里加载扩展：

1. 打开 `chrome://extensions`。
2. 打开“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目里的 `extension/` 目录。

`extension/manifest.json` 内置了固定 public key，因此扩展 ID 会保持稳定。native host manifest 会白名单这个扩展 ID。

## 使用

1. 在普通网页中选中文字。
2. 点击选区旁边浮出的 Codex 图标。
3. 在对话框里输入问题，或直接使用默认的“解释这段内容”。
4. 点击“发送”。

发送后，插件会把选区和页面上下文发给本机 native host。native host 会调用 Codex CLI，返回解释文本后在页面内渲染。

对话框支持：

- 拖动标题栏移动。
- 拖拽右下角调整大小。
- `Cmd/Ctrl + Enter` 发送问题。
- 数学公式渲染。
- 页面缩放或窗口变化后保持在可视区域内。

有些页面不能使用内容脚本，例如 `chrome://` 页面、Chrome Web Store、浏览器内部页面。这是浏览器限制，不是 native host 的问题。

## 历史记录

解释成功后，插件会把记录写入 `chrome.storage.local`。保存的内容包括：

- 划线文本
- 问题
- 回答
- 当前页面 URL 的归一化 key，去掉 hash
- 页面标题
- 文本锚点，包括选中文本、前缀和后缀

同一 URL 再打开时，插件会尝试用文本锚点重新定位原文，并在文字下方画一条细线。点击细线会显示这个划线内容关联的 QA 列表；再点某条 QA 会打开完整历史对话框。

删除历史 QA 是软删除：记录会保留在本地存储状态里并写入 `deletedAt`，但普通历史列表、页面下划线和回看入口都会过滤掉它。某段划线下的 QA 全部软删除后，这段下划线不会再展示。

历史记录只保存在当前 Chrome profile 的本地存储里，不会同步到远端账号。

## 本地桥检查

点击浏览器工具栏里的扩展图标，可以打开一个小弹窗。点击“检查本地桥”会发送 `ping` 给 native host。

也可以在终端检查：

```bash
npm run check-host
```

成功时会返回 Codex 路径、超时时间等信息。

如果页面里显示 `Native host has exited.`，通常先重新安装 native host：

```bash
npm run setup
```

如果页面一直停在 `Codex 正在解释...`，先刷新扩展和页面：

1. 打开 `chrome://extensions`。
2. 点击 `Codex Selection Explainer` 卡片上的刷新按钮。
3. 刷新正在使用的网页。
4. 重新划线发送。

Chrome 从图形界面启动 native host 时通常没有终端里的 Homebrew、nvm 或 asdf `PATH`。所以 launcher 不直接写死某个 Node 安装目录，而是按顺序读取：

1. `CODEX_SELECTION_EXPLAINER_NODE_PATH`
2. macOS 的 `launchctl getenv CODEX_SELECTION_EXPLAINER_NODE_PATH`
3. Windows 的 `HKCU\Environment\CODEX_SELECTION_EXPLAINER_NODE_PATH`
4. 一键脚本生成的 `native-host/node-path.txt`
5. 当前进程能找到的 `node`

换了 Node 版本或安装位置后，重新跑一键脚本即可：

```bash
npm run setup
```

也可以只重新安装 native host：

```bash
npm run install-host
```

## 配置

默认配置在代码里，示例文件是：

```bash
native-host/config.example.json
```

如需覆盖，复制一份：

```bash
cp native-host/config.example.json native-host/config.json
```

可配置字段：

- `codexPath`: Codex CLI 路径。
- `model`: 传给 `codex exec -m` 的模型名；留空使用 Codex 默认配置。
- `timeoutMs`: 单次解释超时时间，默认 `120000`。
- `workspaceDir`: Codex 的运行工作目录；留空使用项目内 `.codex-browser-workspace/`。
- `usageLogEnabled`: 是否记录每次解释调用的用量元数据；默认开启。
- `usageLogPath`: 用量日志路径；留空使用 `native-host/usage.jsonl`。
- `extraArgs`: 追加给 `codex exec` 的参数数组。

也可以用环境变量临时覆盖：

```bash
CODEX_SELECTION_EXPLAINER_NODE_PATH=/path/to/node npm run install-host
CODEX_SELECTION_EXPLAINER_CODEX_PATH=/path/to/codex npm run check-host
CODEX_SELECTION_EXPLAINER_MODEL=gpt-5 npm run check-host
CODEX_SELECTION_EXPLAINER_TIMEOUT_MS=180000 npm run check-host
CODEX_SELECTION_EXPLAINER_USAGE_LOG_ENABLED=false npm run check-host
CODEX_SELECTION_EXPLAINER_USAGE_LOG_PATH=/tmp/codex-selection-usage.jsonl npm run check-host
```

## 用量日志

默认会把每次解释调用的元数据追加写入：

```text
native-host/usage.jsonl
```

每行是一条 JSON 记录，包含：

- 调用时间
- 是否成功
- 页面 `host` 和 `origin`
- 选区、问题、上下文、prompt 的字符数
- 耗时
- Codex `turn.completed` 返回的 token 用量

日志不会保存划线原文、页面正文、页面标题、标签页标题，也不会保存完整 URL path 或 query。

`native-host/usage.jsonl` 已被 `.gitignore` 排除。

## 项目结构

```text
extension/       Chrome 扩展源码
native-host/     Native Messaging host 和 Codex CLI 调用逻辑
scripts/         安装、检查、生成图标等脚本
test/            Node.js 测试
```

关键文件：

- `extension/content-script.js`: 页面内选区、浮动按钮、对话框、历史划线和历史回看入口。
- `extension/background.js`: Chrome service worker，负责转发解释请求和历史存储请求。
- `extension/context-utils.js`: 页面上下文采集。
- `extension/history-store.js`: 历史记录构建、URL 归一化、软删除和查询。
- `extension/anchor-utils.js`: 基于选中文本、前缀、后缀的文本锚点。
- `extension/render-math.js`: 文本与 LaTeX 片段渲染。
- `native-host/index.mjs`: Native Messaging 协议入口。
- `native-host/prompt.mjs`: 浏览器请求归一化和 prompt 组装。
- `native-host/codex-runner.mjs`: `codex exec` 参数、进程管理、超时和用量解析。
- `native-host/usage-log.mjs`: 用量日志脱敏写入。

## 请求链路

解释一次选区时，链路如下：

1. `content-script.js` 读取当前选区、构造文本锚点，并采集页面上下文。
2. 内容脚本向 background 发送 `codex-selection-explain`。
3. `background.js` 通过 Chrome Native Messaging 调用 `com.local.codex_selection_explainer`。
4. `native-host/index.mjs` 解码消息，调用 `prompt.mjs` 生成中文解释 prompt。
5. `codex-runner.mjs` 运行本机 Codex CLI。
6. native host 把最终回答和 token 用量返回给 background。
7. background 把成功回答存入 Chrome 本地历史。
8. 内容脚本渲染回答，并重绘页面历史下划线。

Codex 调用参数默认包含：

```text
-a never
-s read-only
exec
--skip-git-repo-check
--ephemeral
--color never
--json
--output-last-message <temp-file>
-C <workspaceDir>
-
```

这意味着 Codex 运行在只读沙箱里，不需要审批，不复用历史会话，并从 stdin 接收本次 prompt。

## 开发命令

一键安装或修复本地桥：

```bash
npm run setup
```

运行测试：

```bash
npm test
```

检查 native host：

```bash
npm run check-host
```

发起一次真实解释检查：

```bash
npm run check-explain
```

打印当前扩展 ID：

```bash
npm run print-extension-id
```

重新生成图标：

```bash
npm run generate-icons
```

重新安装 native host：

```bash
npm run install-host
```

`npm run install-host` 只重写 native host launcher、manifest 和 Node 路径 fallback；`npm run setup` 会额外处理 macOS/Windows 用户环境、Codex CLI 本地配置和安装后检查。

改了 `extension/` 里的内容后，需要在 `chrome://extensions` 里刷新扩展，并刷新已经打开的网页。内容脚本不会自动热更新到旧页面里。

## 测试覆盖

测试使用 Node.js 内置 test runner，主要覆盖：

- 文本锚点构建和重复文本消歧。
- 页面上下文采集和长度归一化。
- 浮动按钮、fixed 弹窗、可视区域 clamp、页面缩放下的尺寸处理。
- 历史记录 URL 归一化、排序和软删除。
- Native Messaging 协议帧编码/解码。
- Codex CLI 参数顺序、JSON 事件解析和 token 用量提取。
- LaTeX 分段渲染。
- 用量日志脱敏。
- manifest 脚本加载顺序和本地 KaTeX 资源声明。

## 安全与隐私边界

- 扩展只连接 `com.local.codex_selection_explainer` 这个 native host。
- Native host manifest 只允许当前固定扩展 ID 调用。
- native host 使用 `spawn(command, args)` 调用 Codex，不拼接 shell 命令。
- 传给 Codex 的选区和上下文都有长度限制。
- Codex 默认以 `--ephemeral`、`-a never`、`-s read-only` 运行。
- 浏览器历史记录保存在 `chrome.storage.local`。
- 用量日志只记录元数据和长度，不记录正文内容。

这个扩展会把你选中的文字和页面上下文发送给本机 Codex CLI。是否再由 Codex CLI 调用远端模型，取决于你本机 Codex 的配置和登录状态。
