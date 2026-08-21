import { spawn } from "node:child_process";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRIDGE_HOST,
  BRIDGE_PORT,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SERVICE_NAME
} from "./service.mjs";

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(serverDirectory, "server.mjs");

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function health() {
  return new Promise((resolvePromise) => {
    const request = get(`http://${BRIDGE_HOST}:${BRIDGE_PORT}/health`, { timeout: 500 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolvePromise(value?.service === BRIDGE_SERVICE_NAME && value?.protocolVersion === BRIDGE_PROTOCOL_VERSION);
        } catch {
          resolvePromise(false);
        }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolvePromise(false));
  });
}

if (await health()) {
  process.stdout.write("本地 AI 转发服务已运行。\n");
  process.exit(0);
}

const child = spawn(process.execPath, [serverPath], {
  cwd: tmpdir(),
  detached: true,
  stdio: "ignore",
  windowsHide: true
});
child.unref();

let available = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await sleep(100);
  if (await health()) {
    available = true;
    break;
  }
}

if (!available) {
  process.stderr.write("本地 AI 转发服务未能在 4 秒内启动，请手动运行 server/start-server.cmd。\n");
  process.exit(1);
}
process.stdout.write("本地 AI 转发服务已启动。\n");
