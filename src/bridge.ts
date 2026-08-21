import type { AiBridgeStatus, AiRequestMode, AiRequestTransport } from "./types";

export const LOCAL_AI_BRIDGE_ORIGIN = "http://127.0.0.1:7879";
const LOCAL_AI_BRIDGE_HEALTH = `${LOCAL_AI_BRIDGE_ORIGIN}/health`;
const LOCAL_AI_BRIDGE_RELAY = `${LOCAL_AI_BRIDGE_ORIGIN}/relay`;
const BRIDGE_SERVICE_NAME = "figma-asset-renamer-bridge";
const BRIDGE_PROTOCOL_VERSION = 1;
const HEALTH_TIMEOUT_MS = 1200;

function plainHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  const result: Record<string, string> = {};
  if (Array.isArray(headers)) {
    for (const [name, value] of headers) result[name] = value;
    return result;
  }
  if (typeof (headers as Headers).forEach === "function") {
    (headers as Headers).forEach((value, name) => {
      result[name] = value;
    });
    return result;
  }
  return { ...(headers as Record<string, string>) };
}

export async function checkLocalAiBridge(fetchImpl: typeof fetch = fetch): Promise<AiBridgeStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      fetchImpl(LOCAL_AI_BRIDGE_HEALTH, { method: "GET", cache: "no-store" }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("健康检查超时")), HEALTH_TIMEOUT_MS);
      })
    ]);
    if (!response.ok) {
      return {
        available: false,
        endpoint: LOCAL_AI_BRIDGE_ORIGIN,
        protocolVersion: null,
        message: `本地服务返回 HTTP ${response.status}`
      };
    }
    const value = JSON.parse(await response.text()) as Record<string, unknown>;
    const protocolVersion = typeof value.protocolVersion === "number" ? value.protocolVersion : null;
    if (value.service !== BRIDGE_SERVICE_NAME || protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
      return {
        available: false,
        endpoint: LOCAL_AI_BRIDGE_ORIGIN,
        protocolVersion,
        message: "7879 端口上的服务与当前插件不兼容"
      };
    }
    return {
      available: true,
      endpoint: LOCAL_AI_BRIDGE_ORIGIN,
      protocolVersion,
      message: "本地转发服务已连接"
    };
  } catch (error) {
    return {
      available: false,
      endpoint: LOCAL_AI_BRIDGE_ORIGIN,
      protocolVersion: null,
      message: `本地转发服务未启动：${error instanceof Error ? error.message : String(error)}`
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createLocalAiBridgeFetch(fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const endpoint = String(input);
    const method = init?.method === "GET" ? "GET" : "POST";
    const body = typeof init?.body === "string" ? init.body : undefined;
    if (init?.body !== undefined && body === undefined) {
      throw new Error("本地转发服务只支持字符串请求正文");
    }
    return fetchImpl(LOCAL_AI_BRIDGE_RELAY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpoint,
        method,
        headers: plainHeaders(init?.headers),
        ...(body === undefined ? {} : { body })
      }),
      redirect: "error"
    });
  };
}

export const localAiBridgeFetch = createLocalAiBridgeFetch();

export async function resolveAiRequestTransport(
  mode: AiRequestMode,
  fetchImpl: typeof fetch = fetch
): Promise<{ transport: AiRequestTransport; fetchImpl: typeof fetch; bridgeStatus: AiBridgeStatus }> {
  const status = await checkLocalAiBridge(fetchImpl);
  if (mode === "direct") {
    return { transport: "direct", fetchImpl, bridgeStatus: status };
  }
  if (status.available) {
    return { transport: "bridge", fetchImpl: createLocalAiBridgeFetch(fetchImpl), bridgeStatus: status };
  }
  if (mode === "bridge") {
    throw new Error(`${status.message}。请运行 server/start-server.cmd 后重试。`);
  }
  return { transport: "direct", fetchImpl, bridgeStatus: status };
}
