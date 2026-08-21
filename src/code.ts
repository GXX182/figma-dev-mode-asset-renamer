import { buildDownloadNames, findUnknownTokens } from "./naming";
import {
  analyzeAiImages,
  formatAiError,
  getAiRequestDiagnostic,
  listAiModels,
  resolveAiApiFormat,
  validateAiBaseUrl
} from "./ai";
import { checkLocalAiBridge, localAiBridgeFetch } from "./bridge";
import type {
  AiApiFormat,
  AiProviderProfileView,
  AiRequestDiagnostic,
  AiRequestMode,
  AiRequestTransport,
  AiSettingsView,
  AiSuggestion,
  ExportConfig,
  ExportFormat,
  ExportableNodeInfo,
  PluginToUiMessage,
  UiToPluginMessage
} from "./types";

type ExportableSceneNode = SceneNode & ExportMixin;

const SUPPORTED_FORMATS = new Set<ExportFormat>(["PNG", "JPG", "SVG", "PDF"]);
const SUPPORTED_SCALES = new Set([1, 2, 3, 4]);
const SETTINGS_KEY = "asset-renamer-settings-v1";
const AI_SETTINGS_KEY = "asset-renamer-ai-settings-v1";
const AI_BATCH_SIZE = 6;
const MAX_AI_IMAGE_BYTES = 8 * 1024 * 1024;

type ActiveAiAnalysis = {
  id: number;
  suggestions: AiSuggestion[];
  failedNodeIds: string[];
  total: number;
};

type StartingAiAnalysis = Pick<ActiveAiAnalysis, "id" | "total">;

let activeAiAnalysis: ActiveAiAnalysis | null = null;
let startingAiAnalysis: StartingAiAnalysis | null = null;
let nextAiAnalysisId = 1;

type StoredAiProvider = Omit<AiProviderProfileView, "resolvedApiFormat" | "keyConfigured" | "maskedApiKey"> & {
  apiKey: string;
};

type StoredAiSettings = Omit<AiSettingsView, "providers"> & {
  providers: StoredAiProvider[];
};

const DEFAULT_AI_PROMPT = {
  id: "prompt-default",
  name: "通用素材命名",
  content: [
    "根据图片的主要视觉内容和在界面中的用途命名。",
    "优先使用稳定、清晰的产品语义，避免使用颜色、尺寸、序号等容易变化的信息。",
    "背景使用 background，图标使用 icon，按钮素材使用 button，装饰素材使用 decoration。",
    "名称保持简短，使用英文 kebab-case。"
  ].join("\n")
};

function defaultAiSettings(): StoredAiSettings {
  return {
    activeProviderId: "provider-default",
    requestMode: "auto",
    providers: [{
      id: "provider-default",
      name: "AI 服务",
      apiFormat: "auto",
      baseUrl: "",
      model: "",
      apiKey: ""
    }],
    prompts: [{ ...DEFAULT_AI_PROMPT }],
    skills: [],
    strategy: { type: "prompt", id: DEFAULT_AI_PROMPT.id }
  };
}

function postMessage(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

function isActiveAiAnalysis(analysis: ActiveAiAnalysis): boolean {
  return activeAiAnalysis?.id === analysis.id;
}

function markAiNodeFailed(analysis: ActiveAiAnalysis, nodeId: string): void {
  if (!analysis.failedNodeIds.includes(nodeId)) analysis.failedNodeIds.push(nodeId);
}

function cancelAiAnalysis(): void {
  const analysis = activeAiAnalysis;
  if (analysis) {
    activeAiAnalysis = null;
    postMessage({
      type: "ai-analysis-cancelled",
      suggestions: analysis.suggestions,
      failedNodeIds: analysis.failedNodeIds,
      total: analysis.total
    });
    return;
  }
  const starting = startingAiAnalysis;
  if (!starting) return;
  startingAiAnalysis = null;
  postMessage({
    type: "ai-analysis-cancelled",
    suggestions: [],
    failedNodeIds: [],
    total: starting.total
  });
}

function isExportable(node: SceneNode): node is ExportableSceneNode {
  return "exportAsync" in node && typeof node.exportAsync === "function";
}

function namedParent(node: SceneNode): string {
  const parent = node.parent;
  return parent && "name" in parent && typeof parent.name === "string" ? parent.name : "";
}

function numericProperty(node: SceneNode, property: "width" | "height"): number | null {
  return property in node && typeof node[property] === "number" ? node[property] : null;
}

function describeNode(node: ExportableSceneNode): ExportableNodeInfo {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    parentName: namedParent(node),
    pageName: figma.currentPage.name,
    width: numericProperty(node, "width"),
    height: numericProperty(node, "height")
  };
}

function postSelection(): void {
  const selection = figma.currentPage.selection;
  const exportableNodes = selection.filter(isExportable);
  postMessage({
    type: "selection",
    items: exportableNodes.map(describeNode),
    ignoredCount: selection.length - exportableNodes.length
  });
}

async function postSavedSettings(): Promise<void> {
  try {
    const config = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as Partial<ExportConfig> | undefined;
    postMessage({ type: "settings", config: config ?? null });
  } catch {
    postMessage({ type: "settings", config: null });
  }
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "••••••••";
  return `${apiKey.slice(0, 3)}••••••••${apiKey.slice(-4)}`;
}

function aiSettingsView(settings: StoredAiSettings): AiSettingsView {
  return {
    activeProviderId: settings.activeProviderId,
    requestMode: normalizedRequestMode(settings.requestMode),
    providers: settings.providers.map((provider) => {
      let resolvedApiFormat: AiProviderProfileView["resolvedApiFormat"] = null;
      try {
        resolvedApiFormat = provider.baseUrl
          ? resolveAiApiFormat(provider.apiFormat, provider.baseUrl)
          : null;
      } catch {
        resolvedApiFormat = null;
      }
      return {
        id: provider.id,
        name: provider.name,
        apiFormat: provider.apiFormat,
        resolvedApiFormat,
        baseUrl: provider.baseUrl,
        model: provider.model,
        keyConfigured: Boolean(provider.apiKey),
        maskedApiKey: maskApiKey(provider.apiKey)
      };
    }),
    prompts: settings.prompts.map((prompt) => ({ ...prompt })),
    skills: settings.skills.map((skill) => ({ ...skill })),
    strategy: { ...settings.strategy }
  };
}

async function readAiSettings(): Promise<StoredAiSettings> {
  try {
    const stored = await figma.clientStorage.getAsync(AI_SETTINGS_KEY) as StoredAiSettings | undefined;
    if (stored && Array.isArray(stored.providers) && stored.providers.length > 0) {
      return { ...stored, requestMode: normalizedRequestMode(stored.requestMode) };
    }
  } catch {
    // 使用默认值继续。
  }
  return defaultAiSettings();
}

async function postAiSettings(): Promise<void> {
  postMessage({ type: "ai-settings", settings: aiSettingsView(await readAiSettings()) });
}

function clippedText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || fallback : fallback;
}

function normalizedApiFormat(value: unknown): AiApiFormat {
  return ["auto", "gemini-native", "openai-compatible", "anthropic-compatible"].includes(String(value))
    ? value as AiApiFormat
    : "auto";
}

function normalizedRequestMode(value: unknown): AiRequestMode {
  return value === "direct" || value === "bridge" ? value : "auto";
}

async function saveAiSettings(view: AiSettingsView, apiKeys: Record<string, string> = {}): Promise<void> {
  const previous = await readAiSettings();
  const previousKeys = new Map(previous.providers.map((provider) => [provider.id, provider.apiKey]));
  const providers: StoredAiProvider[] = view.providers.slice(0, 20).map((provider, index) => ({
    id: /^[a-z0-9-]{1,80}$/u.test(provider.id) ? provider.id : `provider-${index + 1}`,
    name: clippedText(provider.name, `AI 服务 ${index + 1}`, 80),
    apiFormat: normalizedApiFormat(provider.apiFormat),
    baseUrl: typeof provider.baseUrl === "string" ? provider.baseUrl.trim().slice(0, 2048) : "",
    model: typeof provider.model === "string" ? provider.model.trim().slice(0, 300) : "",
    apiKey: typeof apiKeys[provider.id] === "string" && apiKeys[provider.id].trim()
      ? apiKeys[provider.id].trim().slice(0, 8192)
      : previousKeys.get(provider.id) || ""
  }));
  if (providers.length === 0) {
    providers.push(defaultAiSettings().providers[0]);
  }
  const prompts = view.prompts.slice(0, 50).map((prompt, index) => ({
    id: /^[a-z0-9-]{1,80}$/u.test(prompt.id) ? prompt.id : `prompt-${index + 1}`,
    name: clippedText(prompt.name, `提示词 ${index + 1}`, 80),
    content: typeof prompt.content === "string" ? prompt.content.slice(0, 20_000) : ""
  })).filter((prompt) => prompt.content.trim());
  if (prompts.length === 0) prompts.push({ ...DEFAULT_AI_PROMPT });
  const skills = view.skills.slice(0, 50).map((skill, index) => ({
    id: /^[a-z0-9-]{1,80}$/u.test(skill.id) ? skill.id : `skill-${index + 1}`,
    name: clippedText(skill.name, `Skill ${index + 1}`, 100),
    content: typeof skill.content === "string" ? skill.content.slice(0, 64_000) : ""
  })).filter((skill) => skill.content.trim());
  const activeProviderId = providers.some((provider) => provider.id === view.activeProviderId)
    ? view.activeProviderId
    : providers[0].id;
  const requestedStrategy = view.strategy;
  const strategyExists = requestedStrategy.type === "skill"
    ? skills.some((skill) => skill.id === requestedStrategy.id)
    : prompts.some((prompt) => prompt.id === requestedStrategy.id);
  const strategy = strategyExists
    ? { ...requestedStrategy }
    : { type: "prompt" as const, id: prompts[0].id };
  await figma.clientStorage.setAsync(AI_SETTINGS_KEY, {
    activeProviderId,
    requestMode: normalizedRequestMode(view.requestMode),
    providers,
    prompts,
    skills,
    strategy
  } satisfies StoredAiSettings);
  await postAiSettings();
}

async function postAiBridgeStatus(): Promise<void> {
  postMessage({ type: "ai-bridge-status", status: await checkLocalAiBridge() });
}

async function selectedAiTransport(mode: AiRequestMode): Promise<{
  transport: AiRequestTransport;
  fetchImpl: typeof fetch;
}> {
  if (mode === "direct") return { transport: "direct", fetchImpl: fetch };
  const bridgeStatus = await checkLocalAiBridge();
  postMessage({ type: "ai-bridge-status", status: bridgeStatus });
  if (bridgeStatus.available) return { transport: "bridge", fetchImpl: localAiBridgeFetch };
  if (mode === "bridge") {
    throw new Error(`${bridgeStatus.message}。请运行 server/start-server.cmd 后重试。`);
  }
  return { transport: "direct", fetchImpl: fetch };
}

async function postAiModels(
  providerView: AiProviderProfileView,
  suppliedApiKey?: string,
  requestedMode?: AiRequestMode
): Promise<void> {
  try {
    const settings = await readAiSettings();
    const stored = settings.providers.find((provider) => provider.id === providerView.id);
    const apiKey = suppliedApiKey?.trim() || stored?.apiKey || "";
    const selection = await selectedAiTransport(normalizedRequestMode(requestedMode ?? settings.requestMode));
    const result = await listAiModels({
      apiFormat: providerView.apiFormat,
      baseUrl: providerView.baseUrl,
      apiKey,
      model: providerView.model
    }, selection.fetchImpl, selection.transport);
    postMessage({
      type: "ai-models",
      providerId: providerView.id,
      models: result.models,
      resolvedApiFormat: result.resolvedApiFormat,
      transport: selection.transport
    });
  } catch (error) {
    const diagnostic = getAiRequestDiagnostic(error);
    postMessage({
      type: "ai-error",
      message: formatAiError(error),
      ...(diagnostic ? { diagnostic } : {})
    });
  }
}

async function saveSettings(config: ExportConfig): Promise<void> {
  try {
    await figma.clientStorage.setAsync(SETTINGS_KEY, config);
  } catch {
    // 设置保存失败不应阻断当前操作。
  }
}

function validateConfig(config: ExportConfig): string | null {
  if (!SUPPORTED_FORMATS.has(config.format)) {
    return "不支持这个导出格式";
  }
  if (!SUPPORTED_SCALES.has(config.scale)) {
    return "导出倍率必须是 1、2、3 或 4";
  }
  const unknownTokens = findUnknownTokens(config.template);
  if (unknownTokens.length > 0) {
    return `命名规则包含未知变量：${unknownTokens.map((token) => `{${token}}`).join("、")}`;
  }
  return null;
}

function exportSettings(format: ExportFormat, scale: number): ExportSettings {
  if (format === "PNG" || format === "JPG") {
    return {
      format,
      constraint: { type: "SCALE", value: scale }
    };
  }
  if (format === "SVG") {
    return {
      format: "SVG",
      svgOutlineText: false,
      svgIdAttribute: true
    };
  }
  return { format: "PDF" };
}

async function exportSelection(config: ExportConfig, semanticNames: Record<string, string> = {}): Promise<void> {
  const validationError = validateConfig(config);
  if (validationError) {
    postMessage({ type: "error", message: validationError });
    return;
  }

  const nodes = figma.currentPage.selection.filter(isExportable);
  if (nodes.length === 0) {
    postMessage({ type: "error", message: "请先在画布中选中至少一个可导出的图片或图层" });
    return;
  }

  const names = buildDownloadNames(nodes.map(describeNode), config, config.format, config.scale, new Date(), semanticNames);
  const settings = exportSettings(config.format, config.scale);
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  const failedNames: string[] = [];

  postMessage({ type: "export-started", total: nodes.length });

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const outputName = names[index];
    try {
      const bytes = await node.exportAsync(settings);
      files.push({ name: outputName, bytes });
    } catch {
      failedNames.push(node.name);
    }
    postMessage({
      type: "export-progress",
      completed: index + 1,
      total: nodes.length,
      currentName: outputName
    });
  }

  if (files.length === 0) {
    postMessage({ type: "error", message: "所选图层均未能导出，请检查图层权限或导出格式" });
    return;
  }

  postMessage({ type: "export-complete", files, failedNames });
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const value = (first << 16) | (second << 8) | third;
    output += alphabet[(value >> 18) & 63];
    output += alphabet[(value >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(value >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[value & 63] : "=";
  }
  return output;
}

async function analyzeSelection(): Promise<void> {
  if (activeAiAnalysis || startingAiAnalysis) {
    postMessage({ type: "ai-error", message: "已有一项 AI 分析正在进行" });
    return;
  }
  const nodes = figma.currentPage.selection.filter(isExportable);
  const starting: StartingAiAnalysis = {
    id: nextAiAnalysisId++,
    total: nodes.length
  };
  startingAiAnalysis = starting;
  let settings: Awaited<ReturnType<typeof readAiSettings>>;
  try {
    settings = await readAiSettings();
  } catch (error) {
    if (startingAiAnalysis?.id === starting.id) {
      startingAiAnalysis = null;
      postMessage({ type: "ai-error", message: formatAiError(error, "无法读取 AI 设置") });
    }
    return;
  }
  if (startingAiAnalysis?.id !== starting.id) return;
  startingAiAnalysis = null;
  const provider = settings.providers.find((item) => item.id === settings.activeProviderId);
  if (!provider) {
    postMessage({ type: "ai-error", message: "请先配置 AI 服务" });
    return;
  }
  try {
    validateAiBaseUrl(provider.baseUrl);
  } catch (error) {
    postMessage({ type: "ai-error", message: formatAiError(error) });
    return;
  }
  if (!provider.apiKey) {
    postMessage({ type: "ai-error", message: "请先填写并保存 API Key" });
    return;
  }
  if (!provider.model) {
    postMessage({ type: "ai-error", message: "请先获取并选择视觉模型" });
    return;
  }
  const strategy = settings.strategy.type === "skill"
    ? settings.skills.find((item) => item.id === settings.strategy.id)
    : settings.prompts.find((item) => item.id === settings.strategy.id);
  if (!strategy) {
    postMessage({ type: "ai-error", message: "请选择有效的提示词或 Skill" });
    return;
  }
  if (nodes.length === 0) {
    postMessage({ type: "ai-error", message: "请先选择至少一个可导出的图片或图层" });
    return;
  }

  const batchCount = Math.ceil(nodes.length / AI_BATCH_SIZE);
  const analysis: ActiveAiAnalysis = {
    id: starting.id,
    suggestions: [],
    failedNodeIds: [],
    total: nodes.length
  };
  activeAiAnalysis = analysis;
  postMessage({ type: "ai-analysis-started", total: nodes.length, batchCount, model: provider.model });

  let prepared = 0;
  let failedBatchCount = 0;
  let lastError = "";
  let lastDiagnostic: AiRequestDiagnostic | undefined;

  try {
    let transportSelection: Awaited<ReturnType<typeof selectedAiTransport>>;
    try {
      transportSelection = await selectedAiTransport(settings.requestMode);
    } catch (error) {
      if (isActiveAiAnalysis(analysis)) {
        postMessage({ type: "ai-error", message: formatAiError(error) });
      }
      return;
    }
    if (!isActiveAiAnalysis(analysis)) return;

    for (let offset = 0; offset < nodes.length; offset += AI_BATCH_SIZE) {
      if (!isActiveAiAnalysis(analysis)) return;
      const batch = nodes.slice(offset, offset + AI_BATCH_SIZE);
      const batchNumber = Math.floor(offset / AI_BATCH_SIZE) + 1;
      const images = [] as Parameters<typeof analyzeAiImages>[0]["images"];

      for (let index = 0; index < batch.length; index += 1) {
        if (!isActiveAiAnalysis(analysis)) return;
        postMessage({
          type: "ai-analysis-progress",
          phase: "preparing",
          batch: batchNumber,
          batchCount,
          batchPrepared: index,
          batchSize: batch.length,
          prepared,
          named: analysis.suggestions.length,
          total: nodes.length
        });
        const node = batch[index];
        const info = describeNode(node);
        try {
          const maxDimension = Math.max(info.width || 1, info.height || 1);
          const scale = Math.max(0.01, Math.min(1, 768 / maxDimension));
          const bytes = await node.exportAsync({
            format: "PNG",
            constraint: { type: "SCALE", value: scale }
          });
          if (bytes.byteLength > MAX_AI_IMAGE_BYTES) {
            throw new Error("分析缩略图超过 8 MB");
          }
          images.push({
            ...info,
            sequence: offset + index + 1,
            mediaType: "image/png",
            dataBase64: bytesToBase64(bytes)
          });
        } catch (error) {
          markAiNodeFailed(analysis, node.id);
          lastError = formatAiError(error, "无法生成分析缩略图");
        }
        prepared += 1;
        postMessage({
          type: "ai-analysis-progress",
          phase: "preparing",
          batch: batchNumber,
          batchCount,
          batchPrepared: index + 1,
          batchSize: batch.length,
          prepared,
          named: analysis.suggestions.length,
          total: nodes.length
        });
      }

      if (!isActiveAiAnalysis(analysis)) return;
      if (images.length === 0) {
        failedBatchCount += 1;
        postMessage({
          type: "ai-analysis-batch-failed",
          batch: batchNumber,
          batchCount,
          message: lastError || "这一批图片无法生成分析缩略图",
          failed: analysis.failedNodeIds.length,
          named: analysis.suggestions.length,
          total: nodes.length
        });
        continue;
      }

      postMessage({
        type: "ai-analysis-progress",
        phase: "requesting",
        batch: batchNumber,
        batchCount,
        batchPrepared: batch.length,
        batchSize: batch.length,
        prepared,
        named: analysis.suggestions.length,
        total: nodes.length
      });

      try {
        const batchSuggestions = await analyzeAiImages({
          apiFormat: provider.apiFormat,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.model,
          instructions: strategy.content,
          images
        }, transportSelection.fetchImpl, transportSelection.transport);
        if (!isActiveAiAnalysis(analysis)) return;
        analysis.suggestions.push(...batchSuggestions);
        const returned = new Set(batchSuggestions.map((item) => item.nodeId));
        for (const image of images) {
          if (!returned.has(image.id)) markAiNodeFailed(analysis, image.id);
        }
        postMessage({
          type: "ai-analysis-batch-complete",
          batch: batchNumber,
          batchCount,
          suggestions: batchSuggestions,
          failed: analysis.failedNodeIds.length,
          named: analysis.suggestions.length,
          total: nodes.length
        });
      } catch (error) {
        if (!isActiveAiAnalysis(analysis)) return;
        failedBatchCount += 1;
        lastError = formatAiError(error);
        lastDiagnostic = getAiRequestDiagnostic(error);
        for (const image of images) markAiNodeFailed(analysis, image.id);
        postMessage({
          type: "ai-analysis-batch-failed",
          batch: batchNumber,
          batchCount,
          message: lastError,
          failed: analysis.failedNodeIds.length,
          named: analysis.suggestions.length,
          total: nodes.length,
          ...(lastDiagnostic ? { diagnostic: lastDiagnostic } : {})
        });
      }
    }

    if (!isActiveAiAnalysis(analysis)) return;
    postMessage({
      type: "ai-analysis-complete",
      suggestions: analysis.suggestions,
      failedNodeIds: analysis.failedNodeIds,
      failedBatchCount,
      ...(analysis.failedNodeIds.length ? { message: lastError || "部分图片未能生成有效的语义名称" } : {}),
      ...(lastDiagnostic ? { diagnostic: lastDiagnostic } : {})
    });
  } finally {
    if (activeAiAnalysis?.id === analysis.id) activeAiAnalysis = null;
  }
}

if (figma.editorType !== "dev") {
  figma.notify("请在 Figma Dev Mode 中运行“图片命名下载”");
  figma.closePlugin();
} else {
  figma.showUI(__html__, { width: 380, height: 640, themeColors: true });

  figma.ui.onmessage = (message: UiToPluginMessage): void => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "ui-ready") {
      postSelection();
      void postSavedSettings();
      void postAiSettings();
      void postAiBridgeStatus();
      return;
    }
    if (message.type === "save-settings") {
      void saveSettings(message.config);
      return;
    }
    if (message.type === "save-ai-settings") {
      void saveAiSettings(message.settings, message.apiKeys);
      return;
    }
    if (message.type === "list-ai-models") {
      void postAiModels(message.provider, message.apiKey, message.requestMode);
      return;
    }
    if (message.type === "check-ai-bridge") {
      void postAiBridgeStatus();
      return;
    }
    if (message.type === "analyze-selection") {
      void analyzeSelection();
      return;
    }
    if (message.type === "cancel-ai-analysis") {
      cancelAiAnalysis();
      return;
    }
    if (message.type === "export") {
      void exportSelection(message.config, message.semanticNames);
    }
  };

  figma.on("selectionchange", postSelection);
}
