import {
  BRIDGE_HOST,
  BRIDGE_PORT,
  BRIDGE_SERVICE_NAME,
  createBridgeServer
} from "./service.mjs";

const server = createBridgeServer();

server.on("error", (error) => {
  process.stderr.write(`${BRIDGE_SERVICE_NAME} 启动失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
  process.stdout.write(`${BRIDGE_SERVICE_NAME} 已监听 http://${BRIDGE_HOST}:${BRIDGE_PORT}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close());
}
