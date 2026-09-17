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
const PREVIEW_CONCURRENCY = 4;

const state: {
  items: ExportableNodeInfo[];
  ignoredCount: number;
  busy: boolean;
  singleExportNodeId: string | null;
  config: ExportConfig;
  collapsedPreviews: Set<string>;
  previewUrls: Map<string, string>;
  previewLoading: Set<string>;
  previewQueue: string[];
  previewActive: Set<string>;
  previewErrors: Map<string, string>;
  downloadedNodeIds: Set<string>;
} = {
  items: [],
  ignoredCount: 0,
  busy: false,
  singleExportNodeId: null,
  config: { ...defaultConfig },
  collapsedPreviews: new Set(),
  previewUrls: new Map(),
  previewLoading: new Set(),
  previewQueue: [],
  previewActive: new Set(),
  previewErrors: new Map(),
  downloadedNodeIds: new Set()
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`找不到界面元素：${id}`);
  }
  return found as T;
}

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

function previewNames(): string[] {
  return buildDownloadNames(
    state.items,
    state.config,
    state.config.format,
    state.config.scale,
    new Date()
  );
}

function pumpPreviewRequests(): void {
  while (state.previewActive.size < PREVIEW_CONCURRENCY && state.previewQueue.length > 0) {
    const nodeId = state.previewQueue.shift();
    if (!nodeId || !state.previewLoading.has(nodeId) || !state.items.some((item) => item.id === nodeId)) {
      if (nodeId) state.previewLoading.delete(nodeId);
      continue;
    }
    state.previewActive.add(nodeId);
    postMessage({ type: "preview-one", nodeId });
  }
}

function requestPreview(nodeId: string): void {
  if (state.previewUrls.has(nodeId) || state.previewLoading.has(nodeId) || state.previewErrors.has(nodeId)) {
    return;
  }
  state.previewLoading.add(nodeId);
  state.previewQueue.push(nodeId);
  pumpPreviewRequests();
}

function reconcilePreviewState(items: ExportableNodeInfo[]): void {
  const activeIds = new Set(items.map((item) => item.id));
  for (const [nodeId, url] of state.previewUrls) {
    if (!activeIds.has(nodeId)) {
      URL.revokeObjectURL(url);
      state.previewUrls.delete(nodeId);
    }
  }
  for (const nodeId of state.previewLoading) {
    if (!activeIds.has(nodeId)) {
      state.previewLoading.delete(nodeId);
    }
  }
  state.previewQueue = state.previewQueue.filter((nodeId) => activeIds.has(nodeId));
  for (const nodeId of state.previewActive) {
    if (!activeIds.has(nodeId)) {
      state.previewActive.delete(nodeId);
    }
  }
  for (const nodeId of state.previewErrors.keys()) {
    if (!activeIds.has(nodeId)) {
      state.previewErrors.delete(nodeId);
    }
  }
  for (const nodeId of state.downloadedNodeIds) {
    if (!activeIds.has(nodeId)) {
      state.downloadedNodeIds.delete(nodeId);
    }
  }
  for (const nodeId of state.collapsedPreviews) {
    if (!activeIds.has(nodeId)) {
      state.collapsedPreviews.delete(nodeId);
    }
  }
  pumpPreviewRequests();
}

function syncDownloadButton(button: HTMLButtonElement, nodeId: string, name: string): void {
  const downloading = state.singleExportNodeId === nodeId;
  const downloaded = state.downloadedNodeIds.has(nodeId) && !downloading;
  button.classList.toggle("is-loading", downloading);
  button.classList.toggle("is-downloaded", downloaded);
  button.disabled = state.busy || Boolean(namingError());

  const label = downloading
    ? `正在下载 ${name}`
    : downloaded
      ? `已下载 ${name}，再次点击可重新下载`
      : `单独下载 ${name}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = downloading
    ? '<svg class="preview-download-spinner" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6.5"></circle></svg>'
    : downloaded
      ? '<svg class="preview-download-icon preview-download-icon--check" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 10.25 3.15 3.1L15 6.65"></path></svg><svg class="preview-download-icon preview-download-icon--download" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 3.25v8.5m0 0 3-3m-3 3-3-3M4.25 15.75h11.5"></path></svg>'
      : '<svg class="preview-download-icon preview-download-icon--download" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 3.25v8.5m0 0 3-3m-3 3-3-3M4.25 15.75h11.5"></path></svg>';
}

function refreshDownloadButtons(): void {
  previewList.querySelectorAll<HTMLButtonElement>(".preview-download-button").forEach((button) => {
    const nodeId = button.dataset.nodeId;
    const name = button.dataset.downloadName;
    if (nodeId && name) {
      syncDownloadButton(button, nodeId, name);
    }
  });
}

function renderPreview(): void {
  const error = namingError();
  templateError.textContent = error || "";
  templateError.hidden = !error;
  previewList.replaceChildren();

  if (state.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "在画布中选择需要下载的图片或图层";
    previewList.append(empty);
    previewSummary.textContent = state.ignoredCount > 0
      ? `0 个文件 · 忽略 ${state.ignoredCount} 个`
      : "0 个文件";
    return;
  }

  const names = previewNames();
  const visibleCount = Math.min(names.length, 60);
  for (let index = 0; index < visibleCount; index += 1) {
    const item = state.items[index];
    const nodeId = item.id;
    const collapsed = state.collapsedPreviews.has(nodeId);
    const row = document.createElement("article");
    row.className = "preview-row";
    row.classList.toggle("is-collapsed", collapsed);

    const rowHeader = document.createElement("div");
    rowHeader.className = "preview-row-header";

    const fileMeta = document.createElement("div");
    fileMeta.className = "preview-file-meta";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "preview-toggle";
    toggleButton.setAttribute("aria-expanded", String(!collapsed));
    toggleButton.setAttribute("aria-label", `${collapsed ? "展开" : "收起"} ${names[index]} 的图片预览`);
    toggleButton.title = collapsed ? "展开图片预览" : "收起图片预览";

    const toggleIcon = document.createElement("span");
    toggleIcon.className = "preview-toggle-icon";
    toggleIcon.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5.5 7.5 4.5 4.5 4.5-4.5"></path></svg>';

    const renamed = document.createElement("span");
    renamed.className = "preview-renamed";
    renamed.textContent = names[index];
    renamed.title = names[index];

    toggleButton.append(toggleIcon, renamed);

    const source = document.createElement("div");
    source.className = "preview-source";
    const sourceLabel = document.createElement("span");
    sourceLabel.className = "preview-source-label";
    sourceLabel.textContent = "原图层";
    const sourceArrow = document.createElement("span");
    sourceArrow.className = "preview-arrow";
    sourceArrow.textContent = "→";

    const original = document.createElement("span");
    original.className = "preview-original";
    original.textContent = item.name;
    original.title = item.name;
    source.append(sourceLabel, sourceArrow, original);
    fileMeta.append(toggleButton, source);

    const previewBody = document.createElement("div");
    previewBody.className = "preview-image-wrap";
    previewBody.hidden = collapsed;

    const previewUrl = state.previewUrls.get(nodeId);
    const previewError = state.previewErrors.get(nodeId);
    if (previewUrl) {
      const image = document.createElement("img");
      image.className = "preview-image";
      image.src = previewUrl;
      image.alt = `${names[index]} 图片预览`;
      previewBody.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "preview-placeholder";
      if (previewError) {
        placeholder.classList.add("is-error");
        placeholder.textContent = previewError;
      } else if (state.previewLoading.has(nodeId)) {
        placeholder.textContent = "正在生成图片预览…";
      } else {
        placeholder.textContent = "准备图片预览…";
      }
      previewBody.append(placeholder);
    }

    toggleButton.addEventListener("click", () => {
      const nextCollapsed = !state.collapsedPreviews.has(nodeId);
      if (nextCollapsed) {
        state.collapsedPreviews.add(nodeId);
      } else {
        state.collapsedPreviews.delete(nodeId);
      }
      row.classList.toggle("is-collapsed", nextCollapsed);
      previewBody.hidden = nextCollapsed;
      toggleButton.setAttribute("aria-expanded", String(!nextCollapsed));
      toggleButton.setAttribute("aria-label", `${nextCollapsed ? "展开" : "收起"} ${names[index]} 的图片预览`);
      toggleButton.title = nextCollapsed ? "展开图片预览" : "收起图片预览";
    });

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "preview-download-button";
    downloadButton.dataset.nodeId = nodeId;
    downloadButton.dataset.downloadName = names[index];
    downloadButton.addEventListener("click", () => {
      if (state.busy || namingError()) return;
      state.busy = true;
      state.singleExportNodeId = nodeId;
      refreshDownloadButtons();
      renderActions();
      setStatus(`正在单独导出 ${names[index]}…`);
      postMessage({
        type: "export-one",
        nodeId,
        config: state.config
      });
    });
    syncDownloadButton(downloadButton, nodeId, names[index]);

    rowHeader.append(fileMeta, downloadButton);
    row.append(rowHeader, previewBody);
    previewList.append(row);
    requestPreview(nodeId);
  }

  if (names.length > visibleCount) {
    const more = document.createElement("div");
    more.className = "preview-more";
    more.textContent = `还有 ${names.length - visibleCount} 个文件未展开`;
    previewList.append(more);
  }
  previewSummary.textContent = state.ignoredCount > 0
    ? `${names.length} 个文件 · 忽略 ${state.ignoredCount} 个`
    : `${names.length} 个文件`;
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
    ? state.singleExportNodeId ? "正在下载单个文件…" : "正在准备下载…"
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
  previewList.querySelectorAll<HTMLButtonElement>(".preview-download-button").forEach((button) => {
    button.disabled = state.busy || Boolean(error);
  });
}

function render(): void {
  renderPreview();
  renderActions();
}

function updateConfig(patch: Partial<ExportConfig>): void {
  state.config = { ...state.config, ...patch };
  state.downloadedNodeIds.clear();
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
  tokenList.replaceChildren();
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

function downloadFile(file: { name: string; bytes: Uint8Array }): void {
  const exactBuffer = file.bytes.buffer.slice(
    file.bytes.byteOffset,
    file.bytes.byteOffset + file.bytes.byteLength
  ) as ArrayBuffer;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    pdf: "application/pdf"
  };
  const url = URL.createObjectURL(new Blob([exactBuffer], { type: mimeTypes[extension] || "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
  state.downloadedNodeIds.clear();
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
    config: state.config
  });
});

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
  const message = event.data?.pluginMessage;
  if (!message) {
    return;
  }

  if (message.type === "selection") {
    reconcilePreviewState(message.items);
    state.items = message.items;
    state.ignoredCount = message.ignoredCount;
    render();
    return;
  }

  if (message.type === "preview-complete") {
    state.previewActive.delete(message.nodeId);
    state.previewLoading.delete(message.nodeId);
    if (!state.items.some((item) => item.id === message.nodeId)) {
      pumpPreviewRequests();
      return;
    }
    const exactBuffer = message.bytes.buffer.slice(
      message.bytes.byteOffset,
      message.bytes.byteOffset + message.bytes.byteLength
    ) as ArrayBuffer;
    const previousUrl = state.previewUrls.get(message.nodeId);
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    state.previewUrls.set(
      message.nodeId,
      URL.createObjectURL(new Blob([exactBuffer], { type: "image/png" }))
    );
    state.previewErrors.delete(message.nodeId);
    pumpPreviewRequests();
    renderPreview();
    return;
  }

  if (message.type === "preview-error") {
    state.previewActive.delete(message.nodeId);
    state.previewLoading.delete(message.nodeId);
    if (!state.items.some((item) => item.id === message.nodeId)) {
      pumpPreviewRequests();
      return;
    }
    state.previewErrors.set(message.nodeId, message.message);
    pumpPreviewRequests();
    renderPreview();
    return;
  }

  if (message.type === "settings") {
    state.config = mergeSavedConfig(message.config);
    syncControls();
    render();
    return;
  }

  if (message.type === "single-export-started") {
    state.busy = true;
    state.singleExportNodeId = message.nodeId;
    refreshDownloadButtons();
    renderActions();
    setStatus(`正在单独导出 ${message.name}…`);
    return;
  }

  if (message.type === "single-export-complete") {
    try {
      downloadFile(message.file);
      state.downloadedNodeIds.add(message.nodeId);
      setStatus(`已下载 ${message.file.name}`, "success");
    } catch (error) {
      setStatus(`下载失败：${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      state.busy = false;
      state.singleExportNodeId = null;
      refreshDownloadButtons();
      renderActions();
    }
    return;
  }

  if (message.type === "single-export-error") {
    state.busy = false;
    state.singleExportNodeId = null;
    refreshDownloadButtons();
    renderActions();
    setStatus(message.message, "error");
    return;
  }

  if (message.type === "export-started") {
    state.busy = true;
    state.singleExportNodeId = null;
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
      state.singleExportNodeId = null;
      renderActions();
    }
    return;
  }

  if (message.type === "error") {
    state.busy = false;
    state.singleExportNodeId = null;
    renderActions();
    setStatus(message.message, "error");
  }
};

renderTokens();
syncControls();
render();
postMessage({ type: "ui-ready" });
