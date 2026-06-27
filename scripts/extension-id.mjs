import crypto from "node:crypto";

export function extensionIdFromPublicKey(base64Key) {
  const publicKey = Buffer.from(base64Key, "base64");
  const hash = crypto.createHash("sha256").update(publicKey).digest().subarray(0, 16);
  const alphabet = "abcdefghijklmnop";
  let id = "";

  for (const byte of hash) {
    id += alphabet[byte >> 4];
    id += alphabet[byte & 0x0f];
  }

  return id;
}
