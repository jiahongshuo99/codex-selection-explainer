import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPosixNativeHostLauncher,
  buildWindowsNativeHostLauncher
} from "../scripts/native-host-launcher.mjs";
import {
  buildNativeManifest,
  getInstallTarget
} from "../scripts/install-host.mjs";

describe("native host launcher", () => {
  it("uses a Node path environment variable before generated local fallbacks on POSIX", () => {
    const script = buildPosixNativeHostLauncher();

    assert.match(script, /NODE_BIN="\$\{CODEX_SELECTION_EXPLAINER_NODE_PATH:-\}"/);
    assert.match(script, /launchctl getenv CODEX_SELECTION_EXPLAINER_NODE_PATH/);
    assert.match(script, /node-path\.txt/);
    assert.match(script, /command -v node/);
    assert.match(script, /exec "\$NODE_BIN" "\$DIR\/index\.mjs"/);
    assert.match(script, /CODEX_SELECTION_EXPLAINER_NODE_PATH is not set/);
    assert.doesNotMatch(script, /NODE_PATH=/);
    assert.doesNotMatch(script, /\/usr\/bin\/node/);
    assert.doesNotMatch(script, /\/opt\/homebrew/);
    assert.doesNotMatch(script, /env node/);
  });

  it("builds a Windows cmd launcher that can read the user environment registry", () => {
    const script = buildWindowsNativeHostLauncher();

    assert.match(script, /@echo off/);
    assert.match(script, /CODEX_SELECTION_EXPLAINER_NODE_PATH/);
    assert.match(script, /reg query HKCU\\Environment/);
    assert.match(script, /node-path\.txt/);
    assert.match(script, /"%NODE_BIN%" "%DIR%index\.mjs"/);
    assert.doesNotMatch(script, /\/opt\/homebrew/);
  });
});

describe("native host install targets", () => {
  it("uses browser NativeMessagingHosts directories on macOS", () => {
    const target = getInstallTarget({
      browserName: "brave",
      platform: "darwin",
      homeDir: "/Users/alice",
      projectRoot: "/Users/alice/Repos/codex-selection-explainer"
    });

    assert.equal(
      target.manifestPath,
      "/Users/alice/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.local.codex_selection_explainer.json"
    );
    assert.equal(
      target.launcherPath,
      "/Users/alice/Repos/codex-selection-explainer/native-host/run.sh"
    );
    assert.equal(target.registryKey, "");
  });

  it("uses browser NativeMessagingHosts directories on Linux", () => {
    const target = getInstallTarget({
      browserName: "chrome",
      platform: "linux",
      homeDir: "/home/alice",
      projectRoot: "/home/alice/Repos/codex-selection-explainer"
    });

    assert.equal(
      target.manifestPath,
      "/home/alice/.config/google-chrome/NativeMessagingHosts/com.local.codex_selection_explainer.json"
    );
    assert.equal(
      target.launcherPath,
      "/home/alice/Repos/codex-selection-explainer/native-host/run.sh"
    );
    assert.equal(target.registryKey, "");
  });

  it("supports Chromium native messaging locations", () => {
    const linuxTarget = getInstallTarget({
      browserName: "chromium",
      platform: "linux",
      homeDir: "/home/alice",
      projectRoot: "/home/alice/Repos/codex-selection-explainer"
    });
    const windowsTarget = getInstallTarget({
      browserName: "chromium",
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\Alice\\AppData\\Local" },
      homeDir: "C:\\Users\\Alice",
      projectRoot: "C:\\Users\\Alice\\Repos\\codex-selection-explainer"
    });

    assert.equal(
      linuxTarget.manifestPath,
      "/home/alice/.config/chromium/NativeMessagingHosts/com.local.codex_selection_explainer.json"
    );
    assert.equal(
      windowsTarget.registryKey,
      "HKCU\\Software\\Chromium\\NativeMessagingHosts\\com.local.codex_selection_explainer"
    );
  });

  it("uses a Windows registry key and app data manifest path on Windows", () => {
    const target = getInstallTarget({
      browserName: "edge",
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\Alice\\AppData\\Local" },
      homeDir: "C:\\Users\\Alice",
      projectRoot: "C:\\Users\\Alice\\Repos\\codex-selection-explainer"
    });

    assert.equal(
      target.manifestPath,
      "C:\\Users\\Alice\\AppData\\Local\\CodexSelectionExplainer\\NativeMessagingHosts\\edge\\com.local.codex_selection_explainer.json"
    );
    assert.equal(
      target.launcherPath,
      "C:\\Users\\Alice\\Repos\\codex-selection-explainer\\native-host\\run.cmd"
    );
    assert.equal(
      target.registryKey,
      "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.local.codex_selection_explainer"
    );
  });

  it("builds a manifest pointing at the generated launcher", () => {
    const manifest = buildNativeManifest({
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      launcherPath: "/repo/native-host/run.sh"
    });

    assert.deepEqual(manifest, {
      name: "com.local.codex_selection_explainer",
      description: "Local Codex CLI bridge for Codex Selection Explainer",
      path: "/repo/native-host/run.sh",
      type: "stdio",
      allowed_origins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]
    });
  });
});
