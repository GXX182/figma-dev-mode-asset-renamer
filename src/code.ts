import { buildDownloadNames, findUnknownTokens } from "./naming";
import type {
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

function postMessage(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
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

async function exportSelection(config: ExportConfig): Promise<void> {
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

  const names = buildDownloadNames(nodes.map(describeNode), config, config.format, config.scale, new Date());
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

function previewExportSettings(node: ExportableSceneNode): ExportSettings {
  const width = Math.max(1, Math.min(320, Math.round(node.width)));
  return {
    format: "PNG",
    constraint: { type: "WIDTH", value: width }
  };
}

async function exportPreview(nodeId: string): Promise<void> {
  const node = figma.currentPage.selection.find(
    (candidate): candidate is ExportableSceneNode => candidate.id === nodeId && isExportable(candidate)
  );
  if (!node) {
    postMessage({ type: "preview-error", nodeId, message: "图层已不在当前选择中" });
    return;
  }

  try {
    const bytes = await node.exportAsync(previewExportSettings(node));
    postMessage({ type: "preview-complete", nodeId, bytes });
  } catch {
    postMessage({ type: "preview-error", nodeId, message: "暂时无法生成预览" });
  }
}

async function exportOne(
  nodeId: string,
  config: ExportConfig
): Promise<void> {
  const validationError = validateConfig(config);
  if (validationError) {
    postMessage({ type: "single-export-error", nodeId, message: validationError });
    return;
  }

  const nodes = figma.currentPage.selection.filter(isExportable);
  const nodeIndex = nodes.findIndex((node) => node.id === nodeId);
  if (nodeIndex < 0) {
    postMessage({ type: "single-export-error", nodeId, message: "这个图层已不在当前选择中，请重新选择后再下载" });
    return;
  }

  const names = buildDownloadNames(
    nodes.map(describeNode),
    config,
    config.format,
    config.scale,
    new Date()
  );
  const node = nodes[nodeIndex];
  const outputName = names[nodeIndex];
  postMessage({ type: "single-export-started", nodeId, name: outputName });
  try {
    const bytes = await node.exportAsync(exportSettings(config.format, config.scale));
    postMessage({ type: "single-export-complete", nodeId, file: { name: outputName, bytes } });
  } catch {
    postMessage({ type: "single-export-error", nodeId, message: `无法导出 ${node.name}，请检查图层权限或导出格式` });
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
      return;
    }
    if (message.type === "save-settings") {
      void saveSettings(message.config);
      return;
    }
    if (message.type === "preview-one") {
      void exportPreview(message.nodeId);
      return;
    }
    if (message.type === "export") {
      void exportSelection(message.config);
      return;
    }
    if (message.type === "export-one") {
      void exportOne(message.nodeId, message.config);
    }
  };

  figma.on("selectionchange", postSelection);
}
