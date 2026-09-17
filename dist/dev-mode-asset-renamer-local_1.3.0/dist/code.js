"use strict";
(() => {
  // src/naming.ts
  var DEFAULT_NAMING_CONFIG = {
    template: "{name}-{index}",
    startIndex: 1,
    indexPadding: 2,
    duplicateSeparator: "-",
    lowercase: false,
    spaces: "keep"
  };
  var SUPPORTED_TOKENS = [
    "name",
    "index",
    "parent",
    "page",
    "type",
    "width",
    "height",
    "format",
    "scale",
    "date"
  ];
  var TOKEN_SET = new Set(SUPPORTED_TOKENS);
  var WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  var KNOWN_EXTENSION = /\.(png|jpe?g|svg|pdf|webp|gif|avif)$/i;
  var MAX_STEM_LENGTH = 140;
  function findUnknownTokens(template) {
    const unknown = /* @__PURE__ */ new Set();
    for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
      const token = match[1].toLowerCase();
      if (!TOKEN_SET.has(token)) {
        unknown.add(token);
      }
    }
    return [...unknown];
  }
  function stripKnownExtension(value) {
    return value.replace(KNOWN_EXTENSION, "");
  }
  function formatDate(now) {
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }
  function transformSpaces(value, style) {
    if (style === "hyphen") {
      return value.replace(/\s+/g, "-");
    }
    if (style === "underscore") {
      return value.replace(/\s+/g, "_");
    }
    return value;
  }
  function truncate(value, maxLength) {
    return Array.from(value).slice(0, maxLength).join("");
  }
  function sanitizeWindowsStem(value) {
    let safe = value.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "-").replace(/-{2,}/g, "-").trim().replace(/[. ]+$/g, "");
    if (!safe) {
      safe = "asset";
    }
    safe = truncate(safe, MAX_STEM_LENGTH).replace(/[. ]+$/g, "");
    if (WINDOWS_RESERVED_NAME.test(safe)) {
      safe = `_${safe}`;
    }
    return safe || "asset";
  }
  function numberToken(value) {
    return value === null ? "auto" : String(Math.round(value));
  }
  function typeToken(value) {
    return value.toLowerCase().replace(/_/g, "-");
  }
  function stemWithSuffix(stem, suffix) {
    const availableLength = Math.max(1, MAX_STEM_LENGTH - Array.from(suffix).length);
    return `${truncate(stem, availableLength).replace(/[. ]+$/g, "")}${suffix}`;
  }
  function buildDownloadNames(items, config, format, scale, now = /* @__PURE__ */ new Date()) {
    const template = config.template.trim() || DEFAULT_NAMING_CONFIG.template;
    const startIndex = Number.isFinite(config.startIndex) ? Math.max(0, Math.floor(config.startIndex)) : 1;
    const padding = Number.isFinite(config.indexPadding) ? Math.min(8, Math.max(1, Math.floor(config.indexPadding))) : 2;
    const extension = format.toLowerCase();
    const usedNames = /* @__PURE__ */ new Set();
    return items.map((item, position) => {
      const index = String(startIndex + position).padStart(padding, "0");
      const values = {
        name: stripKnownExtension(item.name) || "asset",
        index,
        parent: item.parentName || "root",
        page: item.pageName || "page",
        type: typeToken(item.type),
        width: numberToken(item.width),
        height: numberToken(item.height),
        format: extension,
        scale: String(scale),
        date: formatDate(now)
      };
      let stem = template.replace(/\{([^{}]+)\}/g, (match, rawToken) => {
        const token = rawToken.toLowerCase();
        return TOKEN_SET.has(token) ? values[token] : match;
      });
      stem = transformSpaces(stem, config.spaces);
      if (config.lowercase) {
        stem = stem.toLocaleLowerCase();
      }
      stem = sanitizeWindowsStem(stem);
      let uniqueStem = stem;
      let duplicateNumber = 2;
      while (usedNames.has(uniqueStem.toLocaleLowerCase())) {
        uniqueStem = stemWithSuffix(stem, `${config.duplicateSeparator}${duplicateNumber}`);
        duplicateNumber += 1;
      }
      usedNames.add(uniqueStem.toLocaleLowerCase());
      return `${uniqueStem}.${extension}`;
    });
  }

  // src/code.ts
  var SUPPORTED_FORMATS = /* @__PURE__ */ new Set(["PNG", "JPG", "SVG", "PDF"]);
  var SUPPORTED_SCALES = /* @__PURE__ */ new Set([1, 2, 3, 4]);
  var SETTINGS_KEY = "asset-renamer-settings-v1";
  function postMessage(message) {
    figma.ui.postMessage(message);
  }
  function isExportable(node) {
    return "exportAsync" in node && typeof node.exportAsync === "function";
  }
  function namedParent(node) {
    const parent = node.parent;
    return parent && "name" in parent && typeof parent.name === "string" ? parent.name : "";
  }
  function numericProperty(node, property) {
    return property in node && typeof node[property] === "number" ? node[property] : null;
  }
  function describeNode(node) {
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
  function postSelection() {
    const selection = figma.currentPage.selection;
    const exportableNodes = selection.filter(isExportable);
    postMessage({
      type: "selection",
      items: exportableNodes.map(describeNode),
      ignoredCount: selection.length - exportableNodes.length
    });
  }
  async function postSavedSettings() {
    try {
      const config = await figma.clientStorage.getAsync(SETTINGS_KEY);
      postMessage({ type: "settings", config: config ?? null });
    } catch {
      postMessage({ type: "settings", config: null });
    }
  }
  async function saveSettings(config) {
    try {
      await figma.clientStorage.setAsync(SETTINGS_KEY, config);
    } catch {
    }
  }
  function validateConfig(config) {
    if (!SUPPORTED_FORMATS.has(config.format)) {
      return "\u4E0D\u652F\u6301\u8FD9\u4E2A\u5BFC\u51FA\u683C\u5F0F";
    }
    if (!SUPPORTED_SCALES.has(config.scale)) {
      return "\u5BFC\u51FA\u500D\u7387\u5FC5\u987B\u662F 1\u30012\u30013 \u6216 4";
    }
    const unknownTokens = findUnknownTokens(config.template);
    if (unknownTokens.length > 0) {
      return `\u547D\u540D\u89C4\u5219\u5305\u542B\u672A\u77E5\u53D8\u91CF\uFF1A${unknownTokens.map((token) => `{${token}}`).join("\u3001")}`;
    }
    return null;
  }
  function exportSettings(format, scale) {
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
  async function exportSelection(config) {
    const validationError = validateConfig(config);
    if (validationError) {
      postMessage({ type: "error", message: validationError });
      return;
    }
    const nodes = figma.currentPage.selection.filter(isExportable);
    if (nodes.length === 0) {
      postMessage({ type: "error", message: "\u8BF7\u5148\u5728\u753B\u5E03\u4E2D\u9009\u4E2D\u81F3\u5C11\u4E00\u4E2A\u53EF\u5BFC\u51FA\u7684\u56FE\u7247\u6216\u56FE\u5C42" });
      return;
    }
    const names = buildDownloadNames(nodes.map(describeNode), config, config.format, config.scale, /* @__PURE__ */ new Date());
    const settings = exportSettings(config.format, config.scale);
    const files = [];
    const failedNames = [];
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
      postMessage({ type: "error", message: "\u6240\u9009\u56FE\u5C42\u5747\u672A\u80FD\u5BFC\u51FA\uFF0C\u8BF7\u68C0\u67E5\u56FE\u5C42\u6743\u9650\u6216\u5BFC\u51FA\u683C\u5F0F" });
      return;
    }
    postMessage({ type: "export-complete", files, failedNames });
  }
  function previewExportSettings(node) {
    const width = Math.max(1, Math.min(320, Math.round(node.width)));
    return {
      format: "PNG",
      constraint: { type: "WIDTH", value: width }
    };
  }
  async function exportPreview(nodeId) {
    const node = figma.currentPage.selection.find(
      (candidate) => candidate.id === nodeId && isExportable(candidate)
    );
    if (!node) {
      postMessage({ type: "preview-error", nodeId, message: "\u56FE\u5C42\u5DF2\u4E0D\u5728\u5F53\u524D\u9009\u62E9\u4E2D" });
      return;
    }
    try {
      const bytes = await node.exportAsync(previewExportSettings(node));
      postMessage({ type: "preview-complete", nodeId, bytes });
    } catch {
      postMessage({ type: "preview-error", nodeId, message: "\u6682\u65F6\u65E0\u6CD5\u751F\u6210\u9884\u89C8" });
    }
  }
  async function exportOne(nodeId, config) {
    const validationError = validateConfig(config);
    if (validationError) {
      postMessage({ type: "single-export-error", nodeId, message: validationError });
      return;
    }
    const nodes = figma.currentPage.selection.filter(isExportable);
    const nodeIndex = nodes.findIndex((node2) => node2.id === nodeId);
    if (nodeIndex < 0) {
      postMessage({ type: "single-export-error", nodeId, message: "\u8FD9\u4E2A\u56FE\u5C42\u5DF2\u4E0D\u5728\u5F53\u524D\u9009\u62E9\u4E2D\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u540E\u518D\u4E0B\u8F7D" });
      return;
    }
    const names = buildDownloadNames(
      nodes.map(describeNode),
      config,
      config.format,
      config.scale,
      /* @__PURE__ */ new Date()
    );
    const node = nodes[nodeIndex];
    const outputName = names[nodeIndex];
    postMessage({ type: "single-export-started", nodeId, name: outputName });
    try {
      const bytes = await node.exportAsync(exportSettings(config.format, config.scale));
      postMessage({ type: "single-export-complete", nodeId, file: { name: outputName, bytes } });
    } catch {
      postMessage({ type: "single-export-error", nodeId, message: `\u65E0\u6CD5\u5BFC\u51FA ${node.name}\uFF0C\u8BF7\u68C0\u67E5\u56FE\u5C42\u6743\u9650\u6216\u5BFC\u51FA\u683C\u5F0F` });
    }
  }
  if (figma.editorType !== "dev") {
    figma.notify("\u8BF7\u5728 Figma Dev Mode \u4E2D\u8FD0\u884C\u201C\u56FE\u7247\u547D\u540D\u4E0B\u8F7D\u201D");
    figma.closePlugin();
  } else {
    figma.showUI(__html__, { width: 380, height: 640, themeColors: true });
    figma.ui.onmessage = (message) => {
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
})();
