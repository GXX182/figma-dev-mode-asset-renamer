export type ExportFormat = "PNG" | "JPG" | "SVG" | "PDF";
export type SpaceStyle = "keep" | "hyphen" | "underscore";

export type NamingConfig = {
  template: string;
  startIndex: number;
  indexPadding: number;
  duplicateSeparator: "-" | "_";
  lowercase: boolean;
  spaces: SpaceStyle;
};

export type ExportConfig = NamingConfig & {
  format: ExportFormat;
  scale: number;
};

export type ExportableNodeInfo = {
  id: string;
  name: string;
  type: string;
  parentName: string;
  pageName: string;
  width: number | null;
  height: number | null;
};

export type SelectionMessage = {
  type: "selection";
  items: ExportableNodeInfo[];
  ignoredCount: number;
};

export type ExportedFile = {
  name: string;
  bytes: Uint8Array;
};

export type PluginToUiMessage =
  | SelectionMessage
  | { type: "settings"; config: Partial<ExportConfig> | null }
  | { type: "preview-complete"; nodeId: string; bytes: Uint8Array }
  | { type: "preview-error"; nodeId: string; message: string }
  | { type: "export-started"; total: number }
  | { type: "export-progress"; completed: number; total: number; currentName: string }
  | { type: "export-complete"; files: ExportedFile[]; failedNames: string[] }
  | { type: "single-export-started"; nodeId: string; name: string }
  | { type: "single-export-complete"; nodeId: string; file: ExportedFile }
  | { type: "single-export-error"; nodeId: string; message: string }
  | { type: "error"; message: string };

export type UiToPluginMessage =
  | { type: "ui-ready" }
  | { type: "save-settings"; config: ExportConfig }
  | { type: "preview-one"; nodeId: string }
  | { type: "export-one"; nodeId: string; config: ExportConfig }
  | { type: "export"; config: ExportConfig };
