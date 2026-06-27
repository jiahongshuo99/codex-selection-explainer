import { execFile, spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { decodeMessages, encodeMessage } from "../native-host/protocol.mjs";
import { installNativeHost, readBrowserName } from "./install-host.mjs";
import { PROJECT_ROOT } from "./manifest-utils.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_CODEX_PATH_MAC = "/Applications/Codex.app/Contents/Resources/codex";

export function parseSetupArgs(args = process.argv.slice(2)) {
  return {
    browserName: readBrowserName(args),
    checkHost: !args.includes("--skip-check")
  };
}

export function extensionSettingsUrl(browserName) {
  if (browserName === "edge") {
    return "edge://extensions";
  }
  if (browserName === "brave") {
    return "brave://extensions";
  }
  if (browserName === "chromium") {
    return "chrome://extensions";
  }
  return "chrome://extensions";
}

export function buildSetupSummary({
  browserName,
  extensionId,
  extensionDir,
  target,
  codexConfigStatus,
  nodeEnvStatus = "",
  checkStatus = ""
}) {
  const lines = [
    `Setup complete for ${browserName}.`,
    `Extension id: ${extensionId}`,
    `Native host manifest: ${target.manifestPath}`,
    `Node path fallback: ${target.nodePathFile}`
  ];

  if (target.registryKey) {
    lines.push(`Windows registry key: ${target.registryKey}`);
  }
  if (nodeEnvStatus) {
    lines.push(`Node environment: ${nodeEnvStatus}`);
  }
  if (codexConfigStatus) {
    lines.push(`Codex config: ${codexConfigStatus}`);
  }
  if (checkStatus) {
    lines.push(`Native host check: ${checkStatus}`);
  }

  lines.push(
    "",
    "Next steps:",
    `1. Open ${extensionSettingsUrl(browserName)}.`,
    "2. Enable Developer mode.",
    `3. Load unpacked extension: ${extensionDir}`,
    "4. Refresh any pages that were already open before setup."
  );

  return lines.join("\n");
}

export async function runSetup({
  args = process.argv.slice(2),
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
  projectRoot = PROJECT_ROOT,
  nodePath = process.execPath,
  stdout = process.stdout
} = {}) {
  const { browserName, checkHost } = parseSetupArgs(args);
  assertSupportedNodeVersion();

  const nodeEnvStatus = await persistNodePath({ platform, nodePath });
  const codexConfigStatus = await ensureCodexConfig({ platform, env, projectRoot });
  const { extensionId, target } = await installNativeHost({
    browserName,
    platform,
    env,
    homeDir,
    projectRoot,
    nodePath
  });
  const checkStatus = checkHost
    ? await checkNativeHost({ launcherPath: target.launcherPath, env, platform })
    : "skipped";
  const summary = buildSetupSummary({
    browserName,
    extensionId,
    extensionDir: path.join(projectRoot, "extension"),
    target,
    codexConfigStatus,
    nodeEnvStatus,
    checkStatus
  });

  stdout.write(`${summary}\n`);
  return { browserName, extensionId, target, summary };
}

export async function ensureCodexConfig({
  platform = process.platform,
  env = process.env,
  projectRoot = PROJECT_ROOT
} = {}) {
  const configPath = path.join(projectRoot, "native-host", "config.json");
  if (await fileExists(configPath)) {
    return "kept existing native-host/config.json";
  }

  const codexPath = await detectCodexPath({ platform, env });
  if (!codexPath) {
    return "Codex CLI was not detected; edit native-host/config.json or set CODEX_SELECTION_EXPLAINER_CODEX_PATH if explanations fail";
  }

  const config = {
    codexPath,
    model: "",
    timeoutMs: 120000,
    workspaceDir: "",
    usageLogEnabled: true,
    usageLogPath: "",
    extraArgs: []
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return "created native-host/config.json from detected Codex CLI";
}

async function detectCodexPath({ platform, env }) {
  if (env.CODEX_SELECTION_EXPLAINER_CODEX_PATH) {
    return env.CODEX_SELECTION_EXPLAINER_CODEX_PATH;
  }

  if (platform === "darwin" && (await fileExists(DEFAULT_CODEX_PATH_MAC))) {
    return DEFAULT_CODEX_PATH_MAC;
  }

  return findCommandOnPath("codex", { platform, env });
}

async function persistNodePath({ platform, nodePath }) {
  if (platform === "darwin") {
    try {
      await execFileAsync("launchctl", [
        "setenv",
        "CODEX_SELECTION_EXPLAINER_NODE_PATH",
        nodePath
      ]);
      return "set CODEX_SELECTION_EXPLAINER_NODE_PATH in launchctl";
    } catch (error) {
      return `launchctl setenv failed; native-host/node-path.txt will be used (${errorMessage(error)})`;
    }
  }

  if (platform === "win32") {
    try {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `[Environment]::SetEnvironmentVariable('CODEX_SELECTION_EXPLAINER_NODE_PATH','${escapePowerShellSingleQuoted(nodePath)}','User')`
      ]);
      return "set CODEX_SELECTION_EXPLAINER_NODE_PATH in the user environment";
    } catch (error) {
      return `user environment update failed; native-host\\node-path.txt will be used (${errorMessage(error)})`;
    }
  }

  return "wrote native-host/node-path.txt as the Node fallback";
}

async function checkNativeHost({ launcherPath, env, platform = process.platform }) {
  const child = spawn(launcherPath, {
    stdio: ["pipe", "pipe", "pipe"],
    env,
    shell: platform === "win32"
  });
  const stdout = [];
  const stderr = [];

  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(encodeMessage({ type: "ping" }));

  const code = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) {
    const detail = Buffer.concat(stderr).toString("utf8").trim();
    return detail || `failed with exit code ${code}`;
  }

  const [message] = decodeMessages(Buffer.concat(stdout));
  return message?.ok ? "ok" : "returned an unexpected response";
}

async function findCommandOnPath(command, { platform, env }) {
  try {
    const result =
      platform === "win32"
        ? await execFileAsync("where.exe", [command], { env })
        : await execFileAsync("sh", ["-lc", `command -v ${shellQuote(command)}`], { env });
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  } catch {
    return "";
  }
}

function assertSupportedNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < 20) {
    throw new Error(`Node.js 20+ is required. Current version: ${process.version}`);
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replaceAll("'", "''");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runSetup().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
