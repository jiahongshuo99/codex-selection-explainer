import { execFile } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getExtensionId, HOST_NAME, PROJECT_ROOT } from "./manifest-utils.mjs";
import { buildNativeHostLauncher } from "./native-host-launcher.mjs";

const execFileAsync = promisify(execFile);

const BROWSER_CONFIGS = {
  chrome: {
    darwinDir: (homeDir) =>
      path.posix.join(homeDir, "Library/Application Support/Google/Chrome/NativeMessagingHosts"),
    linuxDir: (homeDir) =>
      path.posix.join(homeDir, ".config/google-chrome/NativeMessagingHosts"),
    windowsRegistryKey: () =>
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`
  },
  chromium: {
    darwinDir: (homeDir) =>
      path.posix.join(homeDir, "Library/Application Support/Chromium/NativeMessagingHosts"),
    linuxDir: (homeDir) =>
      path.posix.join(homeDir, ".config/chromium/NativeMessagingHosts"),
    windowsRegistryKey: () =>
      `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`
  },
  "chrome-canary": {
    darwinDir: (homeDir) =>
      path.posix.join(
        homeDir,
        "Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
      ),
    linuxDir: (homeDir) =>
      path.posix.join(homeDir, ".config/google-chrome-unstable/NativeMessagingHosts"),
    windowsRegistryKey: () =>
      `HKCU\\Software\\Google\\Chrome SxS\\NativeMessagingHosts\\${HOST_NAME}`
  },
  edge: {
    darwinDir: (homeDir) =>
      path.posix.join(homeDir, "Library/Application Support/Microsoft Edge/NativeMessagingHosts"),
    linuxDir: (homeDir) =>
      path.posix.join(homeDir, ".config/microsoft-edge/NativeMessagingHosts"),
    windowsRegistryKey: () =>
      `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`
  },
  brave: {
    darwinDir: (homeDir) =>
      path.posix.join(
        homeDir,
        "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
      ),
    linuxDir: (homeDir) =>
      path.posix.join(homeDir, ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts"),
    windowsRegistryKey: () =>
      `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`
  }
};

export function readBrowserName(args = process.argv.slice(2)) {
  const browserArg = args.find((arg) => arg.startsWith("--browser="));
  return browserArg ? browserArg.split("=")[1] : "chrome";
}

export function getInstallTarget({
  browserName = "chrome",
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
  projectRoot = PROJECT_ROOT
} = {}) {
  const browserConfig = BROWSER_CONFIGS[browserName];

  if (!browserConfig) {
    throw new Error(`Unsupported browser "${browserName}". Use one of: ${supportedBrowsers()}`);
  }

  const platformPath = platform === "win32" ? path.win32 : path.posix;
  const nativeHostDir = platformPath.join(projectRoot, "native-host");
  const nodePathFile = platformPath.join(nativeHostDir, "node-path.txt");

  if (platform === "win32") {
    const manifestDir = platformPath.join(
      windowsLocalAppData(env, homeDir),
      "CodexSelectionExplainer",
      "NativeMessagingHosts",
      browserName
    );

    return {
      browserName,
      platform,
      manifestPath: platformPath.join(manifestDir, `${HOST_NAME}.json`),
      launcherPath: platformPath.join(nativeHostDir, "run.cmd"),
      nodePathFile,
      registryKey: browserConfig.windowsRegistryKey()
    };
  }

  if (platform === "darwin" || platform === "linux") {
    const installDir =
      platform === "darwin"
        ? browserConfig.darwinDir(homeDir)
        : browserConfig.linuxDir(homeDir);

    return {
      browserName,
      platform,
      manifestPath: path.posix.join(installDir, `${HOST_NAME}.json`),
      launcherPath: path.posix.join(nativeHostDir, "run.sh"),
      nodePathFile,
      registryKey: ""
    };
  }

  throw new Error(`Unsupported platform "${platform}". Supported platforms: darwin, linux, win32`);
}

export function buildNativeManifest({ extensionId, launcherPath }) {
  return {
    name: HOST_NAME,
    description: "Local Codex CLI bridge for Codex Selection Explainer",
    path: launcherPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`]
  };
}

export async function installNativeHost({
  browserName = readBrowserName(),
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
  projectRoot = PROJECT_ROOT,
  nodePath = process.execPath,
  registerWindowsHost = true
} = {}) {
  const target = getInstallTarget({ browserName, platform, env, homeDir, projectRoot });
  const extensionId = await getExtensionId();
  const nativeManifest = buildNativeManifest({
    extensionId,
    launcherPath: target.launcherPath
  });

  await mkdir(path.dirname(target.manifestPath), { recursive: true });
  await mkdir(path.dirname(target.launcherPath), { recursive: true });
  await writeFile(target.launcherPath, buildNativeHostLauncher({ platform }), "utf8");
  await writeFile(target.nodePathFile, `${nodePath}\n`, "utf8");

  if (platform !== "win32") {
    await chmod(target.launcherPath, 0o755);
  }

  await writeFile(target.manifestPath, `${JSON.stringify(nativeManifest, null, 2)}\n`, "utf8");

  if (platform === "win32" && registerWindowsHost) {
    await registerWindowsManifest(target.registryKey, target.manifestPath);
  }

  return { extensionId, target };
}

async function registerWindowsManifest(registryKey, manifestPath) {
  await execFileAsync("reg", ["add", registryKey, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"]);
}

function windowsLocalAppData(env, homeDir) {
  return env.LOCALAPPDATA || path.win32.join(homeDir, "AppData", "Local");
}

function supportedBrowsers() {
  return Object.keys(BROWSER_CONFIGS).join(", ");
}

async function main() {
  const browserName = readBrowserName();
  const { extensionId, target } = await installNativeHost({ browserName });

  console.log(`Native host installed for ${browserName}: ${target.manifestPath}`);
  if (target.registryKey) {
    console.log(`Windows registry key: ${target.registryKey}`);
  }
  console.log(`Extension id: ${extensionId}`);
  console.log(`Load unpacked extension from: ${path.join(PROJECT_ROOT, "extension")}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
