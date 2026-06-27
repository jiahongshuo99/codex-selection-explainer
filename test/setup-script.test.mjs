import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSetupSummary,
  extensionSettingsUrl,
  parseSetupArgs
} from "../scripts/setup.mjs";

describe("setup script helpers", () => {
  it("parses browser and check flags", () => {
    assert.deepEqual(parseSetupArgs(["--browser=edge", "--skip-check"]), {
      browserName: "edge",
      checkHost: false
    });
  });

  it("defaults to Chrome and native host check", () => {
    assert.deepEqual(parseSetupArgs([]), {
      browserName: "chrome",
      checkHost: true
    });
  });

  it("maps browser names to their extension settings pages", () => {
    assert.equal(extensionSettingsUrl("chrome"), "chrome://extensions");
    assert.equal(extensionSettingsUrl("chrome-canary"), "chrome://extensions");
    assert.equal(extensionSettingsUrl("chromium"), "chrome://extensions");
    assert.equal(extensionSettingsUrl("edge"), "edge://extensions");
    assert.equal(extensionSettingsUrl("brave"), "brave://extensions");
  });

  it("prints the manifest, extension directory, and browser loading page", () => {
    const summary = buildSetupSummary({
      browserName: "edge",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      extensionDir: "/repo/extension",
      target: {
        manifestPath: "/native/manifest.json",
        nodePathFile: "/repo/native-host/node-path.txt",
        registryKey: "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.local.codex_selection_explainer"
      },
      codexConfigStatus: "created native-host/config.json from detected Codex CLI"
    });

    assert.match(summary, /Setup complete for edge/);
    assert.match(summary, /Extension id: abcdefghijklmnopabcdefghijklmnop/);
    assert.match(summary, /Native host manifest: \/native\/manifest\.json/);
    assert.match(summary, /Node path fallback: \/repo\/native-host\/node-path\.txt/);
    assert.match(summary, /Windows registry key: HKCU\\Software\\Microsoft\\Edge/);
    assert.match(summary, /Open edge:\/\/extensions/);
    assert.match(summary, /Load unpacked extension: \/repo\/extension/);
    assert.match(summary, /created native-host\/config\.json/);
  });
});
