import {
  checkLocalAiBridge,
  createLocalAiBridgeFetch,
  LOCAL_AI_BRIDGE_ORIGIN,
  resolveAiRequestTransport
} from "../src/bridge";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(LOCAL_AI_BRIDGE_ORIGIN === "http://127.0.0.1:7879", "本地服务地址必须固定为 127.0.0.1:7879");

const healthFetch: typeof fetch = async () => new Response(JSON.stringify({
  ok: true,
  service: "figma-asset-renamer-bridge",
  protocolVersion: 1
}), { status: 200 });
const health = await checkLocalAiBridge(healthFetch);
assert(health.available, "兼容的本地服务健康检查应成功");

const selection = await resolveAiRequestTransport("auto", healthFetch);
assert(selection.transport === "bridge", "自动模式检测到本地服务后必须使用转发通道");

let relayUrl = "";
let relayValue: Record<string, unknown> = {};
const bridgeFetch = createLocalAiBridgeFetch(async (input, init) => {
  relayUrl = String(input);
  relayValue = JSON.parse(String(init?.body)) as Record<string, unknown>;
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
});
await bridgeFetch("https://provider.example.com/v1/models", {
  method: "GET",
  headers: { authorization: "Bearer secret" }
});
assert(relayUrl === "http://127.0.0.1:7879/relay", "插件必须向 127.0.0.1:7879/relay 请求");
assert(relayValue.endpoint === "https://provider.example.com/v1/models", "本地转发请求丢失上游地址");
assert(relayValue.method === "GET", "本地转发请求丢失 HTTP 方法");

console.log("本地 AI 请求通道测试通过");
