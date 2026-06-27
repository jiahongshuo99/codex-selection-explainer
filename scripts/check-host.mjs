import { spawn } from "node:child_process";
import path from "node:path";
import { decodeMessages, encodeMessage } from "../native-host/protocol.mjs";
import { PROJECT_ROOT } from "./manifest-utils.mjs";

const hostPath = path.join(PROJECT_ROOT, "native-host", "index.mjs");
const child = spawn(process.execPath, [hostPath], {
  stdio: ["pipe", "pipe", "pipe"]
});

const stdout = [];
const stderr = [];
child.stdout.on("data", (chunk) => stdout.push(chunk));
child.stderr.on("data", (chunk) => stderr.push(chunk));
child.stdin.end(encodeMessage({ type: "ping" }));

const code = await new Promise((resolve) => child.on("close", resolve));

if (code !== 0) {
  throw new Error(Buffer.concat(stderr).toString("utf8") || `host exited with ${code}`);
}

const messages = decodeMessages(Buffer.concat(stdout));
console.log(JSON.stringify(messages[0], null, 2));
