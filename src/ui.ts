import {
  buildDownloadNames,
  DEFAULT_NAMING_CONFIG,
  findUnknownTokens,
  SUPPORTED_TOKENS
} from "./naming";
import { buildArchive } from "./archive";
import type {
  AiApiFormat,
  AiBridgeStatus,
  AiModelOption,
  AiProviderProfileView,
  AiRequestDiagnostic,
  AiSettingsView,
  AiSkill,
  ExportConfig,
  ExportFormat,
  ExportableNodeInfo,
  PluginToUiMessage,
  SpaceStyle,
  UiToPluginMessage
} from "./types";

const defaultConfig: ExportConfig = {
  ...DEFAULT_NAMING_CONFIG,
  format: "PNG",
  scale: 2
};

const state: {
  items: ExportableNodeInfo[];
  ignoredCount: number;
  busy: boolean;
  config: ExportConfig;
  aiSettings: AiSettingsView | null;
  aiBusy: boolean;
  aiSuggestions: Record<string, string>;
  bridgeStatus: AiBridgeStatus | null;
  modelOptions: Record<string, AiModelOption[]>;
  apiKeyDrafts: Record<string, string>;
} = {
  items: [],
  ignoredCount: 0,
  busy: false,
  config: { ...defaultConfig },
  aiSettings: null,
  aiBusy: false,
  aiSuggestions: {},
  bridgeStatus: null,
  modelOptions: {},
  apiKeyDrafts: {}
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`找不到界面元素：${id}`);
  }
  return found as T;
}

const selectionCount = element<HTMLSpanElement>("selection-count");
const selectionDetail = element<HTMLParagraphElement>("selection-detail");
const formatSelect = element<HTMLSelectElement>("format");
const scaleGroup = element<HTMLDivElement>("scale-group");
const templateInput = element<HTMLInputElement>("template");
const spacesInput = element<HTMLSelectElement>("spaces");
const lowercaseInput = element<HTMLInputElement>("lowercase");
const tokenList = element<HTMLDivElement>("token-list");
const previewList = element<HTMLDivElement>("preview-list");
const previewSummary = element<HTMLSpanElement>("preview-summary");
const templateError = element<HTMLParagraphElement>("template-error");
const exportButton = element<HTMLButtonElement>("export-button");
const resetButton = element<HTMLButtonElement>("reset-button");
const status = element<HTMLDivElement>("status");
const aiModelSelect = element<HTMLSelectElement>("ai-model-select");
const aiStrategySelect = element<HTMLSelectElement>("ai-strategy-select");
const aiProviderSummary = element<HTMLParagraphElement>("ai-provider-summary");
const aiAnalyzeButton = element<HTMLButtonElement>("ai-analyze-button");
const aiClearButton = element<HTMLButtonElement>("ai-clear-button");
const aiSettingsButton = element<HTMLButtonElement>("ai-settings-button");
const aiSettingsView = element<HTMLElement>("ai-settings-view");
const aiSettingsBack = element<HTMLButtonElement>("ai-settings-back");
const aiProviderSelect = element<HTMLSelectElement>("ai-provider-select");
const aiProviderAdd = element<HTMLButtonElement>("ai-provider-add");
const aiProviderDelete = element<HTMLButtonElement>("ai-provider-delete");
const aiProviderName = element<HTMLInputElement>("ai-provider-name");
const aiApiFormat = element<HTMLSelectElement>("ai-api-format");
const aiRequestMode = element<HTMLSelectElement>("ai-request-mode");
const aiBridgeStatus = element<HTMLElement>("ai-bridge-status");
const aiBridgeStatusText = element<HTMLElement>("ai-bridge-status-text");
const aiBridgeRefresh = element<HTMLButtonElement>("ai-bridge-refresh");
const aiBaseUrl = element<HTMLInputElement>("ai-base-url");
const aiApiKey = element<HTMLInputElement>("ai-api-key");
const aiKeyHelper = element<HTMLParagraphElement>("ai-key-helper");
const aiConnectionResult = element<HTMLDivElement>("ai-connection-result");
const aiRequestDiagnostic = element<HTMLDetailsElement>("ai-request-diagnostic");
const aiDiagnosticState = element<HTMLSpanElement>("ai-diagnostic-state");
const aiDiagnosticPhase = element<HTMLElement>("ai-diagnostic-phase");
const aiDiagnosticStatus = element<HTMLElement>("ai-diagnostic-status");
const aiDiagnosticTransport = element<HTMLElement>("ai-diagnostic-transport");
const aiDiagnosticRequest = element<HTMLElement>("ai-diagnostic-request");
const aiDiagnosticError = element<HTMLElement>("ai-diagnostic-error");
const aiDiagnosticResponse = element<HTMLElement>("ai-diagnostic-response");
const aiDiagnosticCause = element<HTMLParagraphElement>("ai-diagnostic-cause");
const aiCopyDiagnostic = element<HTMLButtonElement>("ai-copy-diagnostic");
const aiFetchModels = element<HTMLButtonElement>("ai-fetch-models");
const aiSettingsModel = element<HTMLSelectElement>("ai-settings-model");
const aiManualModel = element<HTMLInputElement>("ai-manual-model");
const aiSaveConnection = element<HTMLButtonElement>("ai-save-connection");
const aiPromptLibrary = element<HTMLSelectElement>("ai-prompt-library");
const aiPromptNew = element<HTMLButtonElement>("ai-prompt-new");
const aiPromptImport = element<HTMLButtonElement>("ai-prompt-import");
const aiPromptDelete = element<HTMLButtonElement>("ai-prompt-delete");
const aiPromptFile = element<HTMLInputElement>("ai-prompt-file");
const aiPromptName = element<HTMLInputElement>("ai-prompt-name");
const aiPromptContent = element<HTMLTextAreaElement>("ai-prompt-content");
const aiSavePrompt = element<HTMLButtonElement>("ai-save-prompt");
const aiSkillLibrary = element<HTMLSelectElement>("ai-skill-library");
const aiSkillUpload = element<HTMLButtonElement>("ai-skill-upload");
const aiSkillDelete = element<HTMLButtonElement>("ai-skill-delete");
const aiSkillFile = element<HTMLInputElement>("ai-skill-file");
const aiSkillName = element<HTMLInputElement>("ai-skill-name");
const aiSkillContent = element<HTMLTextAreaElement>("ai-skill-content");
const aiSaveSkill = element<HTMLButtonElement>("ai-save-skill");

function saveConfig(): void {
  postMessage({ type: "save-settings", config: state.config });
}

function mergeSavedConfig(saved: Partial<ExportConfig> | null): ExportConfig {
  if (!saved) {
    return { ...defaultConfig };
  }
  return {
    ...defaultConfig,
    ...saved,
    template: typeof saved.template === "string" ? saved.template : defaultConfig.template,
    format: ["PNG", "JPG", "SVG", "PDF"].includes(String(saved.format))
      ? (saved.format as ExportFormat)
      : defaultConfig.format,
    scale: [1, 2, 3, 4].includes(Number(saved.scale)) ? Number(saved.scale) : defaultConfig.scale,
    startIndex: Number.isFinite(Number(saved.startIndex))
      ? Math.max(0, Math.floor(Number(saved.startIndex)))
      : defaultConfig.startIndex,
    indexPadding: [1, 2, 3, 4].includes(Number(saved.indexPadding))
      ? Number(saved.indexPadding)
      : defaultConfig.indexPadding,
    duplicateSeparator: saved.duplicateSeparator === "_" ? "_" : "-",
    spaces: ["keep", "hyphen", "underscore"].includes(String(saved.spaces))
      ? (saved.spaces as SpaceStyle)
      : defaultConfig.spaces,
    lowercase: saved.lowercase === true
  };
}

function postMessage(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

let currentAiDiagnostic: AiRequestDiagnostic | undefined;

function aiDiagnosticText(diagnostic: AiRequestDiagnostic): string {
  const statusText = diagnostic.responseAvailable && diagnostic.status !== null
    ? `${diagnostic.status}${diagnostic.statusText ? ` ${diagnostic.statusText}` : ""}`
    : "未收到可读取的 HTTP 响应";
  return [
    `阶段：${diagnostic.phase === "models" ? "获取模型" : "图片分析"}`,
    `请求通道：${diagnostic.transport === "bridge" ? "本地服务 127.0.0.1:7879" : "Figma 直接连接"}`,
    `请求：${diagnostic.method} ${diagnostic.endpoint}`,
    `HTTP 状态：${statusText}`,
    `错误：${diagnostic.error}`,
    `可能原因：${diagnostic.probableCause}`,
    `响应摘要：${diagnostic.responsePreview || "Figma 未向插件暴露响应头或响应体。"}`
  ].join("\n");
}

function renderAiDiagnostic(diagnostic?: AiRequestDiagnostic): void {
  currentAiDiagnostic = diagnostic;
  aiRequestDiagnostic.hidden = !diagnostic;
  if (!diagnostic) {
    aiRequestDiagnostic.open = false;
    return;
  }
  aiRequestDiagnostic.open = true;
  aiDiagnosticState.textContent = diagnostic.responseAvailable ? "已收到响应" : "未收到响应";
  aiDiagnosticPhase.textContent = diagnostic.phase === "models" ? "获取模型" : "图片分析";
  aiDiagnosticStatus.textContent = diagnostic.responseAvailable && diagnostic.status !== null
    ? `${diagnostic.status}${diagnostic.statusText ? ` ${diagnostic.statusText}` : ""}`
    : "不可用";
  aiDiagnosticTransport.textContent = diagnostic.transport === "bridge" ? "本地服务" : "直接连接";
  aiDiagnosticRequest.textContent = `${diagnostic.method} ${diagnostic.endpoint}`;
  aiDiagnosticError.textContent = diagnostic.error;
  aiDiagnosticResponse.textContent = diagnostic.responsePreview || "Figma 未向插件暴露响应头或响应体。";
  aiDiagnosticCause.textContent = diagnostic.probableCause;
  aiCopyDiagnostic.textContent = "复制诊断信息";
}

function syncControls(): void {
  formatSelect.value = state.config.format;
  templateInput.value = state.config.template;
  spacesInput.value = state.config.spaces;
  lowercaseInput.checked = state.config.lowercase;
  scaleGroup.querySelectorAll<HTMLButtonElement>("[data-scale]").forEach((button) => {
    const active = Number(button.dataset.scale) === state.config.scale;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setStatus(message: string, tone: "neutral" | "success" | "warning" | "error" = "neutral"): void {
  status.textContent = message;
  status.dataset.tone = tone;
}

function activeAiProvider(): AiProviderProfileView | null {
  const settings = state.aiSettings;
  if (!settings) return null;
  return settings.providers.find((provider) => provider.id === settings.activeProviderId)
    || settings.providers[0]
    || null;
}

function option(value: string, label: string): HTMLOptionElement {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function resolvedFormatLabel(format: AiProviderProfileView["resolvedApiFormat"]): string {
  if (format === "gemini-native") return "Gemini 原生";
  if (format === "anthropic-compatible") return "Anthropic 兼容";
  if (format === "openai-compatible") return "OpenAI 兼容";
  return "等待识别";
}

function persistAiSettings(): void {
  if (!state.aiSettings) return;
  const apiKeys = Object.fromEntries(
    Object.entries(state.apiKeyDrafts).filter(([, value]) => value.trim())
  );
  postMessage({
    type: "save-ai-settings",
    settings: state.aiSettings,
    ...(Object.keys(apiKeys).length ? { apiKeys } : {})
  });
}

function renderAiMainControls(): void {
  const settings = state.aiSettings;
  const provider = activeAiProvider();
  aiModelSelect.replaceChildren();
  if (!provider) {
    aiModelSelect.append(option("", "请先配置模型"));
    aiModelSelect.disabled = true;
    aiProviderSummary.textContent = "尚未配置 AI 服务";
  } else {
    const models = state.modelOptions[provider.id] || [];
    const knownModels = models.some((model) => model.id === provider.model)
      ? models
      : provider.model ? [{ id: provider.model, name: provider.model }, ...models] : models;
    if (knownModels.length === 0) {
      aiModelSelect.append(option(provider.model, provider.model || "请到设置中获取模型"));
    } else {
      for (const model of knownModels) aiModelSelect.append(option(model.id, model.name));
    }
    aiModelSelect.value = provider.model;
    aiModelSelect.disabled = state.aiBusy || !provider.baseUrl;
    aiProviderSummary.textContent = `${provider.name} · ${resolvedFormatLabel(provider.resolvedApiFormat)}${provider.keyConfigured ? "" : " · 未保存 API Key"}`;
  }

  aiStrategySelect.replaceChildren();
  if (!settings) {
    aiStrategySelect.append(option("", "通用素材命名"));
    aiStrategySelect.disabled = true;
  } else {
    const promptGroup = document.createElement("optgroup");
    promptGroup.label = "提示词模板";
    for (const prompt of settings.prompts) {
      promptGroup.append(option(`prompt:${prompt.id}`, prompt.name));
    }
    aiStrategySelect.append(promptGroup);
    if (settings.skills.length > 0) {
      const skillGroup = document.createElement("optgroup");
      skillGroup.label = "Skill";
      for (const skill of settings.skills) {
        skillGroup.append(option(`skill:${skill.id}`, skill.name));
      }
      aiStrategySelect.append(skillGroup);
    }
    aiStrategySelect.value = `${settings.strategy.type}:${settings.strategy.id}`;
    aiStrategySelect.disabled = state.aiBusy;
  }

  const suggestionCount = Object.keys(state.aiSuggestions).length;
  aiAnalyzeButton.disabled = state.busy || state.aiBusy || state.items.length === 0;
  aiAnalyzeButton.textContent = state.aiBusy
    ? "正在分析设计图…"
    : suggestionCount > 0
      ? "✦ 重新分析当前选择"
      : "✦ AI 分析当前选择";
  aiClearButton.hidden = suggestionCount === 0;
  aiClearButton.disabled = state.busy || state.aiBusy;
  aiSettingsButton.disabled = state.busy || state.aiBusy;
}

function currentProviderDraft(): AiProviderProfileView | null {
  const settings = state.aiSettings;
  if (!settings) return null;
  return settings.providers.find((provider) => provider.id === aiProviderSelect.value)
    || activeAiProvider();
}

function renderProviderForm(): void {
  const settings = state.aiSettings;
  aiProviderSelect.replaceChildren();
  if (!settings || settings.providers.length === 0) return;
  for (const provider of settings.providers) {
    aiProviderSelect.append(option(provider.id, provider.name));
  }
  aiProviderSelect.value = settings.activeProviderId;
  const provider = activeAiProvider();
  if (!provider) return;
  aiProviderName.value = provider.name;
  aiApiFormat.value = provider.apiFormat;
  aiRequestMode.value = settings.requestMode;
  aiBaseUrl.value = provider.baseUrl;
  aiApiKey.value = state.apiKeyDrafts[provider.id] || "";
  aiKeyHelper.textContent = provider.keyConfigured
    ? `已保存：${provider.maskedApiKey}；输入新 Key 可替换。`
    : "尚未保存 API Key。完整 Key 保存后不会重新显示。";
  aiConnectionResult.textContent = provider.resolvedApiFormat
    ? `当前识别：${resolvedFormatLabel(provider.resolvedApiFormat)}`
    : "填写连接信息后获取模型。";
  renderSettingsModels(provider);
  aiProviderDelete.disabled = settings.providers.length <= 1;
}

function renderBridgeStatus(): void {
  const bridge = state.bridgeStatus;
  if (!bridge) {
    aiBridgeStatus.dataset.state = "checking";
    aiBridgeStatusText.textContent = "正在检测本地服务…";
    aiBridgeRefresh.disabled = true;
    return;
  }
  aiBridgeStatus.dataset.state = bridge.available ? "online" : "offline";
  aiBridgeStatusText.textContent = bridge.message;
  aiBridgeRefresh.disabled = false;
}

function renderSettingsModels(provider: AiProviderProfileView): void {
  const models = state.modelOptions[provider.id] || [];
  aiSettingsModel.replaceChildren(option("", models.length ? "请选择模型" : "请先获取模型"));
  for (const model of models) aiSettingsModel.append(option(model.id, model.name));
  if (provider.model && !models.some((model) => model.id === provider.model)) {
    aiSettingsModel.append(option(provider.model, provider.model));
  }
  aiSettingsModel.value = provider.model;
  aiManualModel.value = provider.model;
}

function renderPromptEditor(selectedId?: string): void {
  const settings = state.aiSettings;
  if (!settings) return;
  aiPromptLibrary.replaceChildren();
  for (const prompt of settings.prompts) aiPromptLibrary.append(option(prompt.id, prompt.name));
  const id = selectedId || aiPromptLibrary.value || settings.prompts[0]?.id || "";
  aiPromptLibrary.value = id;
  const prompt = settings.prompts.find((item) => item.id === id) || settings.prompts[0];
  aiPromptName.value = prompt?.name || "";
  aiPromptContent.value = prompt?.content || "";
  aiPromptDelete.disabled = settings.prompts.length <= 1;
}

function renderSkillEditor(selectedId?: string): void {
  const settings = state.aiSettings;
  if (!settings) return;
  aiSkillLibrary.replaceChildren();
  for (const skill of settings.skills) aiSkillLibrary.append(option(skill.id, skill.name));
  if (settings.skills.length === 0) {
    aiSkillLibrary.append(option("", "尚未上传 Skill"));
  }
  const id = selectedId || aiSkillLibrary.value || settings.skills[0]?.id || "";
  aiSkillLibrary.value = id;
  const skill = settings.skills.find((item) => item.id === id);
  aiSkillName.value = skill?.name || "";
  aiSkillContent.value = skill?.content || "";
  aiSkillDelete.disabled = !skill;
  aiSaveSkill.disabled = !skill;
}

function renderAiSettingsEditors(): void {
  renderProviderForm();
  renderBridgeStatus();
  renderPromptEditor();
  renderSkillEditor();
}

function namingError(): string | null {
  const unknown = findUnknownTokens(state.config.template);
  if (unknown.length > 0) {
    return `未知变量：${unknown.map((token) => `{${token}}`).join("、")}`;
  }
  if (!state.config.template.trim()) {
    return "命名规则不能为空";
  }
  return null;
}

function renderSelection(): void {
  selectionCount.textContent = String(state.items.length);
  if (state.items.length === 0) {
    selectionDetail.textContent = "请在画布中选择需要下载的图片或图层";
  } else if (state.ignoredCount > 0) {
    selectionDetail.textContent = `已识别 ${state.items.length} 个，忽略 ${state.ignoredCount} 个不可导出对象`;
  } else {
    selectionDetail.textContent = `已识别 ${state.items.length} 个可导出对象`;
  }
}

function previewNames(): string[] {
  return buildDownloadNames(
    state.items,
    state.config,
    state.config.format,
    state.config.scale,
    new Date(),
    state.aiSuggestions
  );
}

function renderPreview(): void {
  const error = namingError();
  templateError.textContent = error || "";
  templateError.hidden = !error;
  previewList.replaceChildren();

  if (state.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "选中图层后将在这里预览文件名";
    previewList.append(empty);
    previewSummary.textContent = "0 个文件";
    return;
  }

  const names = previewNames();
  const visibleCount = Math.min(names.length, 60);
  for (let index = 0; index < visibleCount; index += 1) {
    const row = document.createElement("div");
    row.className = "preview-row";

    const original = document.createElement("span");
    original.className = "preview-original";
    original.textContent = state.items[index].name;
    original.title = state.items[index].name;

    const arrow = document.createElement("span");
    arrow.className = "preview-arrow";
    arrow.textContent = "→";

    const renamed = document.createElement("span");
    renamed.className = "preview-renamed";
    renamed.textContent = names[index];
    renamed.title = names[index];

    if (state.aiSuggestions[state.items[index].id]) {
      const nodeId = state.items[index].id;
      renamed.classList.add("is-editable");
      renamed.tabIndex = 0;
      renamed.title = "双击编辑 AI 语义名称";
      const editSuggestion = () => {
        const next = window.prompt("编辑 AI 语义名称", state.aiSuggestions[nodeId]);
        if (next?.trim()) {
          state.aiSuggestions[nodeId] = next.trim();
          render();
          setStatus("已更新 AI 语义名称", "success");
        }
      };
      renamed.addEventListener("dblclick", editSuggestion);
      renamed.addEventListener("keydown", (event) => {
        if (event.key === "Enter") editSuggestion();
      });
      const badge = document.createElement("span");
      badge.className = "ai-badge";
      badge.textContent = "✦ AI";
      renamed.append(badge);
    }

    row.append(original, arrow, renamed);
    previewList.append(row);
  }

  if (names.length > visibleCount) {
    const more = document.createElement("div");
    more.className = "preview-more";
    more.textContent = `还有 ${names.length - visibleCount} 个文件未展开`;
    previewList.append(more);
  }
  previewSummary.textContent = `${names.length} 个文件`;
}

function renderActions(): void {
  const isVectorFormat = state.config.format === "SVG" || state.config.format === "PDF";
  scaleGroup.classList.toggle("is-disabled", isVectorFormat);
  scaleGroup.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = isVectorFormat || state.busy;
  });

  const error = namingError();
  exportButton.disabled = state.busy || state.aiBusy || state.items.length === 0 || Boolean(error);
  exportButton.textContent = state.busy
    ? "正在准备下载…"
    : state.items.length > 0
      ? `打包下载 ${state.items.length} 个文件`
      : "打包下载";

  for (const control of [
    formatSelect,
    templateInput,
    spacesInput,
    lowercaseInput,
    resetButton
  ]) {
    control.disabled = state.busy;
  }
  tokenList.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = state.busy;
  });
  renderAiMainControls();
}

function render(): void {
  renderSelection();
  renderPreview();
  renderActions();
}

function updateConfig(patch: Partial<ExportConfig>): void {
  state.config = { ...state.config, ...patch };
  saveConfig();
  syncControls();
  render();
}

function insertToken(token: string): void {
  const start = templateInput.selectionStart ?? templateInput.value.length;
  const end = templateInput.selectionEnd ?? start;
  const value = templateInput.value;
  const insertion = `{${token}}`;
  const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
  updateConfig({ template: next });
  requestAnimationFrame(() => {
    templateInput.focus();
    templateInput.setSelectionRange(start + insertion.length, start + insertion.length);
  });
}

function renderTokens(): void {
  const labels: Record<string, string> = {
    name: "图层名",
    ai: "AI 语义名",
    index: "序号",
    parent: "父级名",
    page: "页面名",
    type: "类型",
    width: "宽",
    height: "高",
    format: "格式",
    scale: "倍率",
    date: "日期"
  };
  for (const token of SUPPORTED_TOKENS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "token";
    button.textContent = labels[token];
    button.title = `{${token}}`;
    button.addEventListener("click", () => insertToken(token));
    tokenList.append(button);
  }
}

function timestamp(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
}

function downloadArchive(files: Array<{ name: string; bytes: Uint8Array }>): void {
  const archive = buildArchive(files);
  const exactBuffer = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([exactBuffer], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `figma-assets-${timestamp()}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function uniqueId(prefix: "provider" | "prompt" | "skill"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function updateActiveProviderFromForm(): AiProviderProfileView | null {
  const settings = state.aiSettings;
  const provider = activeAiProvider();
  if (!settings || !provider) return null;
  provider.name = aiProviderName.value.trim() || "AI 服务";
  provider.apiFormat = aiApiFormat.value as AiApiFormat;
  settings.requestMode = aiRequestMode.value === "bridge" || aiRequestMode.value === "direct"
    ? aiRequestMode.value
    : "auto";
  provider.baseUrl = aiBaseUrl.value.trim();
  provider.model = (aiManualModel.value.trim() || aiSettingsModel.value).trim();
  if (aiApiKey.value.trim()) state.apiKeyDrafts[provider.id] = aiApiKey.value.trim();
  return provider;
}

function openAiSettings(tab: "connection" | "prompts" | "skills" = "connection"): void {
  aiSettingsView.hidden = false;
  switchSettingsTab(tab);
  renderAiSettingsEditors();
}

function switchSettingsTab(tab: "connection" | "prompts" | "skills"): void {
  document.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.settingsTab === tab);
  });
  document.querySelectorAll<HTMLElement>("[data-settings-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  });
}

async function importedText(input: HTMLInputElement, maxLength: number): Promise<{ name: string; content: string } | null> {
  const file = input.files?.[0];
  if (!file) return null;
  if (file.size > maxLength * 2) throw new Error(`文件过大，最多允许 ${Math.round(maxLength / 1024)} KB`);
  const text = (await file.text()).slice(0, maxLength);
  if (!text.trim()) throw new Error("文件内容为空");
  return { name: file.name.replace(/\.[^.]+$/u, ""), content: text };
}

aiSettingsButton.addEventListener("click", () => openAiSettings());
aiSettingsBack.addEventListener("click", () => {
  aiSettingsView.hidden = true;
});

document.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.settingsTab;
    if (tab === "connection" || tab === "prompts" || tab === "skills") switchSettingsTab(tab);
  });
});

aiProviderSelect.addEventListener("change", () => {
  if (!state.aiSettings) return;
  state.aiSettings.activeProviderId = aiProviderSelect.value;
  renderProviderForm();
});

aiProviderAdd.addEventListener("click", () => {
  if (!state.aiSettings) return;
  const id = uniqueId("provider");
  state.aiSettings.providers.push({
    id,
    name: `AI 服务 ${state.aiSettings.providers.length + 1}`,
    apiFormat: "auto",
    resolvedApiFormat: null,
    baseUrl: "",
    model: "",
    keyConfigured: false,
    maskedApiKey: ""
  });
  state.aiSettings.activeProviderId = id;
  renderProviderForm();
});

aiProviderDelete.addEventListener("click", () => {
  const settings = state.aiSettings;
  if (!settings || settings.providers.length <= 1) return;
  const id = settings.activeProviderId;
  settings.providers = settings.providers.filter((provider) => provider.id !== id);
  delete state.apiKeyDrafts[id];
  delete state.modelOptions[id];
  settings.activeProviderId = settings.providers[0].id;
  persistAiSettings();
  renderProviderForm();
});

aiApiKey.addEventListener("input", () => {
  const provider = activeAiProvider();
  if (provider) state.apiKeyDrafts[provider.id] = aiApiKey.value;
});

aiSettingsModel.addEventListener("change", () => {
  aiManualModel.value = aiSettingsModel.value;
});

aiRequestMode.addEventListener("change", () => {
  if (!state.aiSettings) return;
  state.aiSettings.requestMode = aiRequestMode.value === "bridge" || aiRequestMode.value === "direct"
    ? aiRequestMode.value
    : "auto";
});

aiBridgeRefresh.addEventListener("click", () => {
  state.bridgeStatus = null;
  renderBridgeStatus();
  postMessage({ type: "check-ai-bridge" });
});

aiCopyDiagnostic.addEventListener("click", async () => {
  if (!currentAiDiagnostic) return;
  const diagnostic = aiDiagnosticText(currentAiDiagnostic);
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(diagnostic);
  } catch {
    const input = document.createElement("textarea");
    input.value = diagnostic;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  aiCopyDiagnostic.textContent = "已复制";
});

aiFetchModels.addEventListener("click", () => {
  const provider = updateActiveProviderFromForm();
  if (!provider) return;
  aiFetchModels.disabled = true;
  aiConnectionResult.textContent = "正在连接并获取模型…";
  renderAiDiagnostic();
  postMessage({
    type: "list-ai-models",
    provider,
    requestMode: state.aiSettings?.requestMode,
    ...(state.apiKeyDrafts[provider.id]?.trim() ? { apiKey: state.apiKeyDrafts[provider.id].trim() } : {})
  });
});

aiSaveConnection.addEventListener("click", () => {
  const provider = updateActiveProviderFromForm();
  if (!provider) return;
  persistAiSettings();
  aiConnectionResult.textContent = "正在保存服务配置…";
});

aiPromptLibrary.addEventListener("change", () => renderPromptEditor(aiPromptLibrary.value));
aiPromptNew.addEventListener("click", () => {
  if (!state.aiSettings) return;
  const prompt = { id: uniqueId("prompt"), name: "新提示词", content: "请根据设计图的内容和用途生成简洁的英文 kebab-case 文件名。" };
  state.aiSettings.prompts.push(prompt);
  renderPromptEditor(prompt.id);
});
aiPromptDelete.addEventListener("click", () => {
  const settings = state.aiSettings;
  if (!settings || settings.prompts.length <= 1) return;
  const id = aiPromptLibrary.value;
  settings.prompts = settings.prompts.filter((prompt) => prompt.id !== id);
  if (settings.strategy.type === "prompt" && settings.strategy.id === id) {
    settings.strategy = { type: "prompt", id: settings.prompts[0].id };
  }
  persistAiSettings();
  renderPromptEditor();
});
aiPromptImport.addEventListener("click", () => aiPromptFile.click());
aiPromptFile.addEventListener("change", async () => {
  try {
    const imported = await importedText(aiPromptFile, 20_000);
    if (!imported || !state.aiSettings) return;
    let name = imported.name;
    let content = imported.content;
    if (aiPromptFile.files?.[0]?.name.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(imported.content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        if (typeof record.name === "string") name = record.name;
        if (typeof record.content === "string") content = record.content;
      }
    }
    const prompt = { id: uniqueId("prompt"), name: name.slice(0, 80), content: content.slice(0, 20_000) };
    state.aiSettings.prompts.push(prompt);
    renderPromptEditor(prompt.id);
    setStatus("提示词已导入，请确认后保存", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    aiPromptFile.value = "";
  }
});
aiSavePrompt.addEventListener("click", () => {
  const settings = state.aiSettings;
  const prompt = settings?.prompts.find((item) => item.id === aiPromptLibrary.value);
  if (!settings || !prompt || !aiPromptContent.value.trim()) return;
  prompt.name = aiPromptName.value.trim() || "未命名提示词";
  prompt.content = aiPromptContent.value.slice(0, 20_000);
  persistAiSettings();
  renderPromptEditor(prompt.id);
});

aiSkillLibrary.addEventListener("change", () => renderSkillEditor(aiSkillLibrary.value));
aiSkillUpload.addEventListener("click", () => aiSkillFile.click());
aiSkillFile.addEventListener("change", async () => {
  try {
    const imported = await importedText(aiSkillFile, 64_000);
    if (!imported || !state.aiSettings) return;
    const skill: AiSkill = {
      id: uniqueId("skill"),
      name: imported.name.slice(0, 100),
      content: imported.content
    };
    state.aiSettings.skills.push(skill);
    renderSkillEditor(skill.id);
    setStatus("Skill 已载入，请确认后保存", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    aiSkillFile.value = "";
  }
});
aiSkillDelete.addEventListener("click", () => {
  const settings = state.aiSettings;
  if (!settings) return;
  const id = aiSkillLibrary.value;
  settings.skills = settings.skills.filter((skill) => skill.id !== id);
  if (settings.strategy.type === "skill" && settings.strategy.id === id) {
    settings.strategy = { type: "prompt", id: settings.prompts[0].id };
  }
  persistAiSettings();
  renderSkillEditor();
});
aiSaveSkill.addEventListener("click", () => {
  const settings = state.aiSettings;
  const skill = settings?.skills.find((item) => item.id === aiSkillLibrary.value);
  if (!settings || !skill || !aiSkillContent.value.trim()) return;
  skill.name = aiSkillName.value.trim() || "未命名 Skill";
  skill.content = aiSkillContent.value.slice(0, 64_000);
  persistAiSettings();
  renderSkillEditor(skill.id);
});

aiModelSelect.addEventListener("change", () => {
  const provider = activeAiProvider();
  if (!provider) return;
  provider.model = aiModelSelect.value;
  persistAiSettings();
});

aiStrategySelect.addEventListener("change", () => {
  if (!state.aiSettings) return;
  const [type, id] = aiStrategySelect.value.split(":", 2);
  if ((type === "prompt" || type === "skill") && id) {
    state.aiSettings.strategy = { type, id };
    persistAiSettings();
  }
});

aiAnalyzeButton.addEventListener("click", () => {
  const provider = activeAiProvider();
  if (!provider?.baseUrl || !provider.keyConfigured || !provider.model) {
    openAiSettings();
    aiConnectionResult.textContent = "请先完成 Base URL、API Key 和视觉模型配置。";
    return;
  }
  state.aiBusy = true;
  render();
  setStatus("正在准备设计图分析…");
  postMessage({ type: "analyze-selection" });
});

aiClearButton.addEventListener("click", () => {
  state.aiSuggestions = {};
  render();
  setStatus("已清除 AI 命名结果", "success");
});

formatSelect.addEventListener("change", () => {
  updateConfig({ format: formatSelect.value as ExportFormat });
});

scaleGroup.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-scale]");
  if (target && !target.disabled) {
    updateConfig({ scale: Number(target.dataset.scale) });
  }
});

templateInput.addEventListener("input", () => updateConfig({ template: templateInput.value }));
spacesInput.addEventListener("change", () => updateConfig({ spaces: spacesInput.value as SpaceStyle }));
lowercaseInput.addEventListener("change", () => updateConfig({ lowercase: lowercaseInput.checked }));

resetButton.addEventListener("click", () => {
  state.config = { ...defaultConfig };
  saveConfig();
  syncControls();
  render();
  setStatus("已恢复默认规则", "success");
});

exportButton.addEventListener("click", () => {
  if (state.busy || state.items.length === 0 || namingError()) {
    return;
  }
  state.busy = true;
  renderActions();
  setStatus("正在从 Figma 导出资源…");
  postMessage({
    type: "export",
    config: state.config,
    ...(Object.keys(state.aiSuggestions).length ? { semanticNames: state.aiSuggestions } : {})
  });
});

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
  const message = event.data?.pluginMessage;
  if (!message) {
    return;
  }

  if (message.type === "selection") {
    const previousSelection = state.items.map((item) => item.id).join("|");
    const nextSelection = message.items.map((item) => item.id).join("|");
    if (previousSelection !== nextSelection) state.aiSuggestions = {};
    state.items = message.items;
    state.ignoredCount = message.ignoredCount;
    render();
    return;
  }

  if (message.type === "settings") {
    state.config = mergeSavedConfig(message.config);
    syncControls();
    render();
    return;
  }

  if (message.type === "ai-settings") {
    state.aiSettings = message.settings;
    state.apiKeyDrafts = {};
    renderAiSettingsEditors();
    render();
    if (!aiSettingsView.hidden) aiConnectionResult.textContent = "服务配置已保存。";
    return;
  }

  if (message.type === "ai-bridge-status") {
    state.bridgeStatus = message.status;
    renderBridgeStatus();
    return;
  }

  if (message.type === "ai-models") {
    state.modelOptions[message.providerId] = message.models;
    const provider = state.aiSettings?.providers.find((item) => item.id === message.providerId);
    if (provider) {
      provider.resolvedApiFormat = message.resolvedApiFormat;
      if (!provider.model && message.models.length === 1) {
        provider.model = message.models[0].id;
      }
      renderSettingsModels(provider);
    }
    aiFetchModels.disabled = false;
    renderAiDiagnostic();
    aiConnectionResult.textContent = message.models.length
      ? `连接成功：通过${message.transport === "bridge" ? "本地服务" : "直接连接"}获取到 ${message.models.length} 个模型。`
      : `连接成功：${resolvedFormatLabel(message.resolvedApiFormat)}，但没有发现可用模型，可手动填写模型 ID。`;
    renderAiMainControls();
    return;
  }

  if (message.type === "ai-analysis-started") {
    state.aiBusy = true;
    renderActions();
    setStatus(`正在分析 0 / ${message.total}…`);
    return;
  }

  if (message.type === "ai-analysis-progress") {
    setStatus(`正在准备并分析 ${message.completed} / ${message.total}…`);
    return;
  }

  if (message.type === "ai-analysis-complete") {
    state.aiSuggestions = Object.fromEntries(message.suggestions.map((suggestion) => [suggestion.nodeId, suggestion.name]));
    state.aiBusy = false;
    render();
    const failed = message.failedNodeIds.length ? `，${message.failedNodeIds.length} 个未能命名` : "";
    setStatus(`AI 已生成 ${message.suggestions.length} 个语义名称${failed}`, message.failedNodeIds.length ? "warning" : "success");
    return;
  }

  if (message.type === "ai-error") {
    state.aiBusy = false;
    aiFetchModels.disabled = false;
    render();
    setStatus(message.message, "error");
    renderAiDiagnostic(message.diagnostic);
    if (!aiSettingsView.hidden) aiConnectionResult.textContent = message.message;
    return;
  }

  if (message.type === "export-started") {
    state.busy = true;
    renderActions();
    setStatus(`正在导出 0 / ${message.total}…`);
    return;
  }

  if (message.type === "export-progress") {
    setStatus(`正在导出 ${message.completed} / ${message.total}：${message.currentName}`);
    return;
  }

  if (message.type === "export-complete") {
    try {
      downloadArchive(message.files);
      const failedText = message.failedNames.length
        ? `；${message.failedNames.length} 个图层导出失败`
        : "";
      setStatus(`已打包 ${message.files.length} 个文件${failedText}`, message.failedNames.length ? "warning" : "success");
    } catch (error) {
      setStatus(`下载失败：${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      state.busy = false;
      renderActions();
    }
    return;
  }

  if (message.type === "error") {
    state.busy = false;
    renderActions();
    setStatus(message.message, "error");
  }
};

renderTokens();
syncControls();
render();
postMessage({ type: "ui-ready" });
window.setInterval(() => postMessage({ type: "check-ai-bridge" }), 60_000);
