import {
  buildDownloadNames,
  DEFAULT_NAMING_CONFIG,
  findUnknownTokens,
  SUPPORTED_TOKENS
} from "./naming";
import { buildArchive } from "./archive";
import type {
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
} = {
  items: [],
  ignoredCount: 0,
  busy: false,
  config: { ...defaultConfig }
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
    state.config.scale
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
  exportButton.disabled = state.busy || state.items.length === 0 || Boolean(error);
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
  postMessage({ type: "export", config: state.config });
});

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
  const message = event.data?.pluginMessage;
  if (!message) {
    return;
  }

  if (message.type === "selection") {
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
