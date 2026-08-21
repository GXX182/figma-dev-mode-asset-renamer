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

export type AiApiFormat =
  | "auto"
  | "gemini-native"
  | "openai-compatible"
  | "anthropic-compatible";

export type ResolvedAiApiFormat = Exclude<AiApiFormat, "auto">;

export type AiProviderProfileView = {
  id: string;
  name: string;
  apiFormat: AiApiFormat;
  resolvedApiFormat: ResolvedAiApiFormat | null;
  baseUrl: string;
  model: string;
  keyConfigured: boolean;
  maskedApiKey: string;
};

export type AiPromptTemplate = {
  id: string;
  name: string;
  content: string;
};

export type AiSkill = {
  id: string;
  name: string;
  content: string;
};

export type AiNamingStrategy = {
  type: "prompt" | "skill";
  id: string;
};

export type AiSettingsView = {
  activeProviderId: string;
  providers: AiProviderProfileView[];
  prompts: AiPromptTemplate[];
  skills: AiSkill[];
  strategy: AiNamingStrategy;
};

export type AiModelOption = {
  id: string;
  name: string;
};

export type AiSuggestion = {
  nodeId: string;
  name: string;
  confidence: number | null;
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
  | { type: "ai-settings"; settings: AiSettingsView }
  | {
      type: "ai-models";
      providerId: string;
      models: AiModelOption[];
      resolvedApiFormat: ResolvedAiApiFormat;
    }
  | { type: "ai-analysis-started"; total: number }
  | { type: "ai-analysis-progress"; completed: number; total: number }
  | { type: "ai-analysis-complete"; suggestions: AiSuggestion[]; failedNodeIds: string[] }
  | { type: "ai-error"; message: string }
  | { type: "export-started"; total: number }
  | { type: "export-progress"; completed: number; total: number; currentName: string }
  | { type: "export-complete"; files: ExportedFile[]; failedNames: string[] }
  | { type: "error"; message: string };

export type UiToPluginMessage =
  | { type: "ui-ready" }
  | { type: "save-settings"; config: ExportConfig }
  | {
      type: "save-ai-settings";
      settings: AiSettingsView;
      apiKeys?: Record<string, string>;
    }
  | {
      type: "list-ai-models";
      provider: AiProviderProfileView;
      apiKey?: string;
    }
  | { type: "analyze-selection" }
  | { type: "export"; config: ExportConfig; semanticNames?: Record<string, string> };
