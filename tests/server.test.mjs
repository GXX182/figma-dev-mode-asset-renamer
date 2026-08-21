import { once } from "node:events";
import {
  BRIDGE_SERVICE_NAME,
  createBridgeServer,
  isBlockedAddress,
  normalizeRelayRequest,
  validateRelayEndpoint
} from "../server/service.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(isBlockedAddress("127.0.0.1"), "必须阻止回环地址");
assert(isBlockedAddress("169.254.169.254"), "必须阻止云元数据地址");
assert(isBlockedAddress("192.168.1.20"), "必须阻止私有地址");
assert(!isBlockedAddress("8.8.8.8"), "不应阻止公开 IPv4 地址");

const normalized = normalizeRelayRequest({
  endpoint: "https://api.example.com/v1/models",
  method: "GET",
  headers: { authorization: "Bearer secret", "x-ignored": "value" }
});
assert(normalized.headers.authorization === "Bearer secret", "必须保留允许的上游鉴权头");
assert(normalized.headers["x-ignored"] === undefined, "必须过滤未允许的上游请求头");

let blocked = false;
try {
  await validateRelayEndpoint("https://127.0.0.1/v1/models");
} catch {
  blocked = true;
}
assert(blocked, "必须拒绝向回环地址转发");

const publicEndpoint = await validateRelayEndpoint("https://provider.example.test/v1/models", async () => ([
  { address: "8.8.8.8", family: 4 }
]));
assert(publicEndpoint === "https://provider.example.test/v1/models", "公开 HTTPS 地址校验失败");

const server = createBridgeServer({
  idleTimeoutMs: 0,
  lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
  fetchImpl: async () => new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
    status: 401,
    statusText: "Unauthorized",
    headers: { "content-type": "application/json" }
  })
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address === "object", "测试服务未能监听端口");
const origin = `http://127.0.0.1:${address.port}`;

const health = await fetch(`${origin}/health`, { headers: { origin: "null" } });
const healthBody = await health.json();
assert(health.status === 200 && healthBody.service === BRIDGE_SERVICE_NAME, "健康检查接口失败");
assert(health.headers.get("access-control-allow-origin") === "*", "健康检查缺少 Figma 所需 CORS 响应头");
assert(health.headers.get("access-control-allow-private-network") === "true", "健康检查缺少本地网络访问响应头");

const forbidden = await fetch(`${origin}/relay`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://malicious.example" },
  body: JSON.stringify({ endpoint: "https://api.example.com/v1/models", method: "GET", headers: {} })
});
assert(forbidden.status === 403, "本地服务必须拒绝普通网页来源");

const invalid = await fetch(`${origin}/relay`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "null" },
  body: JSON.stringify({ endpoint: "http://api.example.com/v1/models", method: "GET", headers: {} })
});
assert(invalid.status === 400, "本地服务必须拒绝非 HTTPS 上游地址");

const relayed = await fetch(`${origin}/relay`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "null" },
  body: JSON.stringify({
    endpoint: "https://api.example.com/v1/models",
    method: "GET",
    headers: { authorization: "Bearer secret" }
  })
});
assert(relayed.status === 401, "本地服务必须保留上游 HTTP 状态码");
assert(relayed.headers.get("x-asset-renamer-bridge") === "1", "转发响应缺少本地服务标识");
assert((await relayed.text()).includes("Invalid API key"), "本地服务必须透传上游响应正文");

const closed = once(server, "close");
server.close();
await closed;
console.log("本地 AI 转发服务测试通过");
