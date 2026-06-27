import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getExtensionId, HOST_NAME, PROJECT_ROOT } from "./manifest-utils.mjs";
import { buildNativeHostLauncher } from "./native-host-launcher.mjs";

const BROWSERS = {
  chrome: path.join(
    os.homedir(),
    "Library/Application Support/Google/Chrome/NativeMessagingHosts"
  ),
  "chrome-canary": path.join(
    os.homedir(),
    "Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
  ),
  edge: path.join(
    os.homedir(),
    "Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  ),
  brave: path.join(
    os.homedir(),
    "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  )
};

function readBrowserName() {
  const browserArg = process.argv.find((arg) => arg.startsWith("--browser="));
  return browserArg ? browserArg.split("=")[1] : "chrome";
}

const browserName = readBrowserName();
const installDir = BROWSERS[browserName];

if (!installDir) {
  throw new Error(`Unsupported browser "${browserName}". Use one of: ${Object.keys(BROWSERS).join(", ")}`);
}

const extensionId = await getExtensionId();
const runPath = path.join(PROJECT_ROOT, "native-host", "run.sh");
const nativeManifest = {
  name: HOST_NAME,
  description: "Local Codex CLI bridge for Codex Selection Explainer",
  path: runPath,
  type: "stdio",
  allowed_origins: [`chrome-extension://${extensionId}/`]
};
const outputPath = path.join(installDir, `${HOST_NAME}.json`);

await mkdir(installDir, { recursive: true });
await writeFile(runPath, buildNativeHostLauncher({ nodePath: process.execPath }), "utf8");
await chmod(runPath, 0o755);
await writeFile(outputPath, `${JSON.stringify(nativeManifest, null, 2)}\n`, "utf8");

console.log(`Native host installed for ${browserName}: ${outputPath}`);
console.log(`Extension id: ${extensionId}`);
console.log(`Load unpacked extension from: ${path.join(PROJECT_ROOT, "extension")}`);
