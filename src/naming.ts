import type { ExportableNodeInfo, NamingConfig } from "./types";

export const DEFAULT_NAMING_CONFIG: NamingConfig = {
  template: "{name}-{index}",
  startIndex: 1,
  indexPadding: 2,
  duplicateSeparator: "-",
  lowercase: false,
  spaces: "keep"
};

export const SUPPORTED_TOKENS = [
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
] as const;

const TOKEN_SET = new Set<string>(SUPPORTED_TOKENS);
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const KNOWN_EXTENSION = /\.(png|jpe?g|svg|pdf|webp|gif|avif)$/i;
const MAX_STEM_LENGTH = 140;

export function findUnknownTokens(template: string): string[] {
  const unknown = new Set<string>();
  for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
    const token = match[1].toLowerCase();
    if (!TOKEN_SET.has(token)) {
      unknown.add(token);
    }
  }
  return [...unknown];
}

function stripKnownExtension(value: string): string {
  return value.replace(KNOWN_EXTENSION, "");
}

function formatDate(now: Date): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function transformSpaces(value: string, style: NamingConfig["spaces"]): string {
  if (style === "hyphen") {
    return value.replace(/\s+/g, "-");
  }
  if (style === "underscore") {
    return value.replace(/\s+/g, "_");
  }
  return value;
}

function truncate(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join("");
}

export function sanitizeWindowsStem(value: string): string {
  let safe = value
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "-")
    .replace(/-{2,}/g, "-")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!safe) {
    safe = "asset";
  }

  safe = truncate(safe, MAX_STEM_LENGTH).replace(/[. ]+$/g, "");
  if (WINDOWS_RESERVED_NAME.test(safe)) {
    safe = `_${safe}`;
  }
  return safe || "asset";
}

function numberToken(value: number | null): string {
  return value === null ? "auto" : String(Math.round(value));
}

function typeToken(value: string): string {
  return value.toLowerCase().replace(/_/g, "-");
}

function stemWithSuffix(stem: string, suffix: string): string {
  const availableLength = Math.max(1, MAX_STEM_LENGTH - Array.from(suffix).length);
  return `${truncate(stem, availableLength).replace(/[. ]+$/g, "")}${suffix}`;
}

export function buildDownloadNames(
  items: readonly ExportableNodeInfo[],
  config: NamingConfig,
  format: string,
  scale: number,
  now = new Date()
): string[] {
  const template = config.template.trim() || DEFAULT_NAMING_CONFIG.template;
  const startIndex = Number.isFinite(config.startIndex) ? Math.max(0, Math.floor(config.startIndex)) : 1;
  const padding = Number.isFinite(config.indexPadding)
    ? Math.min(8, Math.max(1, Math.floor(config.indexPadding)))
    : 2;
  const extension = format.toLowerCase();
  const usedNames = new Set<string>();

  return items.map((item, position) => {
    const index = String(startIndex + position).padStart(padding, "0");
    const values: Record<string, string> = {
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

    let stem = template.replace(/\{([^{}]+)\}/g, (match, rawToken: string) => {
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
