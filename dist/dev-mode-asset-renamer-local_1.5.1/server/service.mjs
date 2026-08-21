import { lookup } from "node:dns/promises";
import { createServer } from "node:http";
import { isIP } from "node:net";

export const BRIDGE_HOST = "127.0.0.1";
export const BRIDGE_PORT = 7879;
export const BRIDGE_PROTOCOL_VERSION = 1;
export const BRIDGE_SERVICE_NAME = "figma-asset-renamer-bridge";

const MAX_REQUEST_BYTES = 48 * 1024 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 512 * 1024;
const UPSTREAM_TIMEOUT_MS = 90_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60_000;
const ALLOWED_HEADERS = new Set([
  "accept",
  "anthropic-version",
  "authorization",
  "content-type",
  "x-api-key",
  "x-goog-api-key"
]);

class BridgeServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "BridgeServiceError";
    this.status = status;
    this.code = code;
  }
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    "access-control-expose-headers": "x-asset-renamer-bridge, x-asset-renamer-bridge-error",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "cross-origin-resource-policy": "cross-origin"
  };
}

function writeHeaders(response, headers) {
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
}

function writeJson(response, status, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value));
  response.statusCode = status;
  writeHeaders(response, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.byteLength),
    ...extraHeaders
  });
  response.end(body);
}

function ipv4Parts(address) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address)) return undefined;
  const parts = address.split(".").map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : undefined;
}

export function isBlockedAddress(rawAddress) {
  const address = String(rawAddress).toLowerCase().split("%")[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(address);
  if (mapped) return isBlockedAddress(mapped[1]);
  if (isIP(address) === 6) {
    return address === "::" || address === "::1"
      || /^(?:fc|fd)/u.test(address)
      || /^fe[89ab]/u.test(address)
      || /^ff/u.test(address)
      || /^2001:db8:/u.test(address);
  }
  const parts = ipv4Parts(address);
  if (!parts) return true;
  const [first, second, third] = parts;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 198 && (second === 18 || second === 19 || second === 51))
    || (first === 203 && second === 0 && third === 113);
}

function isProxyFakeAddress(rawAddress) {
  const parts = ipv4Parts(String(rawAddress));
  return Boolean(parts && parts[0] === 198 && (parts[1] === 18 || parts[1] === 19));
}

export async function validateRelayEndpoint(rawEndpoint, lookupImpl = lookup) {
  if (typeof rawEndpoint !== "string" || rawEndpoint.length === 0 || rawEndpoint.length > 2048) {
    throw new BridgeServiceError(400, "invalid-endpoint", "上游请求地址无效");
  }
  let endpoint;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new BridgeServiceError(400, "invalid-endpoint", "上游请求地址格式不正确");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new BridgeServiceError(400, "invalid-endpoint", "本地服务只转发不含凭据、查询参数或锚点的 HTTPS 地址");
  }
  const hostname = endpoint.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new BridgeServiceError(403, "blocked-host", "本地或私有上游地址已被阻止");
  }
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new BridgeServiceError(403, "blocked-host", "私有、回环或保留地址已被阻止");
    }
    return endpoint.toString();
  }
  let addresses;
  try {
    addresses = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new BridgeServiceError(502, "dns-failed", "无法解析上游服务域名");
  }
  if (!Array.isArray(addresses) || addresses.length === 0
    || addresses.some((item) => isBlockedAddress(item.address) && !isProxyFakeAddress(item.address))) {
    throw new BridgeServiceError(403, "blocked-host", "上游域名解析到了私有、回环或保留地址");
  }
  return endpoint.toString();
}

function normalizeRelayHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BridgeServiceError(400, "invalid-headers", "请求头格式不正确");
  }
  const headers = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.toLowerCase();
    if (!ALLOWED_HEADERS.has(name)) continue;
    if (typeof rawValue !== "string" || rawValue.length > 8192 || /[\r\n]/u.test(rawValue)) {
      throw new BridgeServiceError(400, "invalid-headers", "请求头包含无效内容");
    }
    headers[name] = rawValue;
  }
  return headers;
}

export function normalizeRelayRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BridgeServiceError(400, "invalid-request", "转发请求格式不正确");
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !["endpoint", "method", "headers", "body"].includes(key))) {
    throw new BridgeServiceError(400, "invalid-request", "转发请求包含未知字段");
  }
  const method = value.method === "GET" ? "GET" : value.method === "POST" ? "POST" : undefined;
  if (!method) throw new BridgeServiceError(400, "invalid-method", "本地服务只允许 GET 或 POST");
  if (value.body !== undefined && typeof value.body !== "string") {
    throw new BridgeServiceError(400, "invalid-body", "请求正文必须是字符串");
  }
  if (typeof value.body === "string" && Buffer.byteLength(value.body) > MAX_REQUEST_BYTES) {
    throw new BridgeServiceError(413, "body-too-large", "请求正文超过本地服务限制");
  }
  return {
    endpoint: value.endpoint,
    method,
    headers: normalizeRelayHeaders(value.headers),
    ...(typeof value.body === "string" ? { body: value.body } : {})
  };
}

async function readNodeRequest(request, maxBytes) {
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BridgeServiceError(413, "request-too-large", "本地转发请求超过大小限制");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) throw new BridgeServiceError(413, "request-too-large", "本地转发请求超过大小限制");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

async function readUpstreamResponse(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        throw new BridgeServiceError(502, "response-too-large", "上游服务响应超过 512 KB 限制");
      }
      chunks.push(Buffer.from(next.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function relayRequest(value, response, fetchImpl, lookupImpl) {
  const request = normalizeRelayRequest(value);
  const endpoint = await validateRelayEndpoint(request.endpoint, lookupImpl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("上游服务请求超时")), UPSTREAM_TIMEOUT_MS);
  let upstream;
  let body;
  try {
    upstream = await fetchImpl(endpoint, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      redirect: "error",
      signal: controller.signal
    });
    body = await readUpstreamResponse(upstream, MAX_UPSTREAM_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof BridgeServiceError) throw error;
    const message = controller.signal.aborted ? "上游服务请求超时" : "本地服务无法连接上游服务";
    throw new BridgeServiceError(502, "upstream-unavailable", `${message}：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
  response.statusCode = upstream.status;
  if (/^[\x20-\x7e]{1,80}$/u.test(upstream.statusText || "")) response.statusMessage = upstream.statusText;
  writeHeaders(response, {
    ...corsHeaders(),
    "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "content-length": String(body.byteLength),
    "x-asset-renamer-bridge": "1"
  });
  response.end(body);
}

function requestOriginAllowed(request) {
  const origin = request.headers.origin;
  return origin === undefined || origin === "null";
}

export function createBridgeServer(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const lookupImpl = options.lookupImpl || lookup;
  const idleTimeoutMs = options.idleTimeoutMs === undefined ? DEFAULT_IDLE_TIMEOUT_MS : options.idleTimeoutMs;
  let lastActivity = Date.now();
  const server = createServer(async (request, response) => {
    lastActivity = Date.now();
    const url = new URL(request.url || "/", `http://${BRIDGE_HOST}`);
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      writeHeaders(response, corsHeaders());
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, {
        ok: true,
        service: BRIDGE_SERVICE_NAME,
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        pid: process.pid
      });
      return;
    }
    if (!requestOriginAllowed(request)) {
      writeJson(response, 403, { error: { code: "origin-blocked", message: "只接受来自 Figma 插件的本地请求" } }, {
        "x-asset-renamer-bridge-error": "1"
      });
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/relay") {
      writeJson(response, 404, { error: { code: "not-found", message: "本地服务接口不存在" } }, {
        "x-asset-renamer-bridge-error": "1"
      });
      return;
    }
    try {
      const raw = await readNodeRequest(request, MAX_REQUEST_BYTES + 64 * 1024);
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new BridgeServiceError(400, "invalid-json", "本地转发请求不是有效 JSON");
      }
      await relayRequest(value, response, fetchImpl, lookupImpl);
    } catch (error) {
      const status = error instanceof BridgeServiceError ? error.status : 500;
      const code = error instanceof BridgeServiceError ? error.code : "internal-error";
      const message = error instanceof Error ? error.message : "本地服务发生未知错误";
      writeJson(response, status, { error: { code, message } }, { "x-asset-renamer-bridge-error": "1" });
    }
  });

  let idleTimer;
  if (idleTimeoutMs > 0) {
    idleTimer = setInterval(() => {
      if (Date.now() - lastActivity >= idleTimeoutMs) server.close();
    }, Math.min(60_000, Math.max(1000, Math.floor(idleTimeoutMs / 2))));
    idleTimer.unref();
  }
  server.on("close", () => {
    if (idleTimer) clearInterval(idleTimer);
  });
  return server;
}
