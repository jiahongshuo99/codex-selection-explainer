import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extensionIdFromPublicKey } from "./extension-id.mjs";

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const HOST_NAME = "com.local.codex_selection_explainer";

export async function readExtensionManifest() {
  const manifestPath = path.join(PROJECT_ROOT, "extension", "manifest.json");
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export async function getExtensionId() {
  const manifest = await readExtensionManifest();

  if (!manifest.key) {
    throw new Error("extension/manifest.json is missing a stable public key");
  }

  return extensionIdFromPublicKey(manifest.key);
}
