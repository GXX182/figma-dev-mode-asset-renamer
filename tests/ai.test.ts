import { analyzeAiImages, detectAiApiFormat, listAiModels } from "../src/ai";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const originalUrlDescriptor = Object.getOwnPropertyDescriptor(globalThis, "URL");
Object.defineProperty(globalThis, "URL", { configurable: true, writable: true, value: undefined });
try {
  assert(
    detectAiApiFormat("https://openai-compatible.example.com/v1/chat/completions") === "openai-compatible",
    "协议识别不应依赖 Figma 主线程缺失的 URL 全局对象"
  );
} finally {
  if (originalUrlDescriptor) Object.defineProperty(globalThis, "URL", originalUrlDescriptor);
}

assert(
  detectAiApiFormat("https://generativelanguage.googleapis.com/v1beta") === "gemini-native",
  "Gemini 协议自动识别失败"
);
assert(
  detectAiApiFormat("https://api.anthropic.com/v1/messages") === "anthropic-compatible",
  "Anthropic 协议自动识别失败"
);
assert(
  detectAiApiFormat("https://relay.example.com/v1/responses") === "openai-compatible",
  "OpenAI Responses 协议自动识别失败"
);
assert(
  detectAiApiFormat("https://unknown.example.com/v1") === "openai-compatible",
  "未知中转地址应回退到 OpenAI 兼容协议"
);

let modelsRequestUrl = "";
let modelsAuthorization = "";
const modelResult = await listAiModels({
  apiFormat: "auto",
  baseUrl: "https://relay.example.com/v1",
  apiKey: "test-secret",
  model: ""
}, async (input, init) => {
  modelsRequestUrl = String(input);
  modelsAuthorization = new Headers(init?.headers).get("authorization") || "";
  return new Response(JSON.stringify({ data: [{ id: "vision-10" }, { id: "vision-2" }] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
});
assert(modelsRequestUrl === "https://relay.example.com/v1/models", `模型地址推导失败：${modelsRequestUrl}`);
assert(modelsAuthorization === "Bearer test-secret", "OpenAI 鉴权头错误");
assert(modelResult.models.map((model) => model.id).join(",") === "vision-2,vision-10", "模型列表排序失败");

let completeChatModelsUrl = "";
await listAiModels({
  apiFormat: "auto",
  baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
  apiKey: "test-secret",
  model: ""
}, async (input) => {
  completeChatModelsUrl = String(input);
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
});
assert(
  completeChatModelsUrl === "https://opencode.ai/zen/go/v1/models",
  `完整 Chat Completions 地址的模型路径推导失败：${completeChatModelsUrl}`
);

let geminiModelsUrl = "";
let geminiKey = "";
const geminiModels = await listAiModels({
  apiFormat: "auto",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  apiKey: "google-secret",
  model: ""
}, async (input, init) => {
  geminiModelsUrl = String(input);
  geminiKey = new Headers(init?.headers).get("x-goog-api-key") || "";
  return new Response(JSON.stringify({
    models: [
      { name: "models/gemini-vision", displayName: "Gemini Vision", supportedGenerationMethods: ["generateContent"] },
      { name: "models/embedding", supportedGenerationMethods: ["embedContent"] }
    ]
  }), { status: 200 });
});
assert(geminiModelsUrl === "https://generativelanguage.googleapis.com/v1beta/models", "Gemini 模型地址错误");
assert(geminiKey === "google-secret", "Gemini 鉴权头错误");
assert(geminiModels.models[0]?.id === "gemini-vision", "Gemini 模型过滤失败");

let anthropicModelsUrl = "";
let anthropicVersion = "";
const anthropicModels = await listAiModels({
  apiFormat: "anthropic-compatible",
  baseUrl: "https://api.anthropic.com/v1/messages",
  apiKey: "anthropic-secret",
  model: ""
}, async (input, init) => {
  anthropicModelsUrl = String(input);
  anthropicVersion = new Headers(init?.headers).get("anthropic-version") || "";
  return new Response(JSON.stringify({
    data: [
      { id: "claude-vision", capabilities: { image_input: { supported: true } } },
      { id: "claude-text", capabilities: { image_input: { supported: false } } }
    ]
  }), { status: 200 });
});
assert(anthropicModelsUrl === "https://api.anthropic.com/v1/models", "Anthropic 模型地址错误");
assert(anthropicVersion === "2023-06-01", "Anthropic 版本头错误");
assert(anthropicModels.models.map((model) => model.id).join(",") === "claude-vision", "Anthropic 视觉模型过滤失败");

let analysisRequestUrl = "";
const suggestions = await analyzeAiImages({
  apiFormat: "openai-compatible",
  baseUrl: "https://relay.example.com/v1",
  apiKey: "test-secret",
  model: "vision-2",
  instructions: "Use product semantics.",
  images: [{
    id: "1:2",
    sequence: 1,
    name: "background",
    type: "RECTANGLE",
    parentName: "Membership Card",
    pageName: "Home",
    width: 320,
    height: 180,
    mediaType: "image/png",
    dataBase64: "aW1hZ2U="
  }]
}, async (input) => {
  analysisRequestUrl = String(input);
  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: "```json\n{\"items\":[{\"index\":1,\"name\":\"membership-card-background.png\",\"confidence\":0.93}]}\n```"
      }
    }]
  }), { status: 200, headers: { "content-type": "application/json" } });
});
assert(analysisRequestUrl === "https://relay.example.com/v1/chat/completions", "分析地址推导失败");
assert(suggestions[0]?.nodeId === "1:2", "AI 结果节点映射失败");
assert(suggestions[0]?.name === "membership-card-background", "AI 扩展名清理失败");

console.log("AI 协议与解析测试通过");
