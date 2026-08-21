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

export type AiRequestMode = "auto" | "direct" | "bridge";
export type AiRequestTransport = Exclude<AiRequestMode, "auto">;

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
  requestMode: AiRequestMode;
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

export type AiAnalysisPhase = "preparing" | "requesting";

export type AiRequestDiagnostic = {
  phase: "models" | "analysis";
  transport: AiRequestTransport;
  method: "GET" | "POST";
  endpoint: string;
  status: number | null;
  statusText: string;
  responsePreview: string;
  error: string;
  responseAvailable: boolean;
  probableCause: string;
};

export type AiBridgeStatus = {
  available: boolean;
  endpoint: string;
  protocolVersion: number | null;
  message: string;
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
  | { type: "ai-bridge-status"; status: AiBridgeStatus }
  | {
      type: "ai-models";
      providerId: string;
      models: AiModelOption[];
      resolvedApiFormat: ResolvedAiApiFormat;
      transport: AiRequestTransport;
    }
  | { type: "ai-analysis-started"; total: number; batchCount: number; model: string }
  | {
      type: "ai-analysis-progress";
      phase: AiAnalysisPhase;
      batch: number;
      batchCount: number;
      batchPrepared: number;
      batchSize: number;
      prepared: number;
      named: number;
      total: number;
    }
  | {
      type: "ai-analysis-batch-complete";
      batch: number;
      batchCount: number;
      suggestions: AiSuggestion[];
      failed: number;
      named: number;
      total: number;
    }
  | {
      type: "ai-analysis-batch-failed";
      batch: number;
      batchCount: number;
      message: string;
      failed: number;
      named: number;
      total: number;
      diagnostic?: AiRequestDiagnostic;
    }
  | {
      type: "ai-analysis-complete";
      suggestions: AiSuggestion[];
      failedNodeIds: string[];
      failedBatchCount: number;
      message?: string;
      diagnostic?: AiRequestDiagnostic;
    }
  | {
      type: "ai-analysis-cancelled";
      suggestions: AiSuggestion[];
      failedNodeIds: string[];
      total: number;
    }
  | { type: "ai-error"; message: string; diagnostic?: AiRequestDiagnostic }
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
  | {
      type: "save-ai-settings";
      settings: AiSettingsView;
      apiKeys?: Record<string, string>;
    }
  | {
      type: "list-ai-models";
      provider: AiProviderProfileView;
      apiKey?: string;
      requestMode?: AiRequestMode;
    }
  | { type: "check-ai-bridge" }
  | { type: "analyze-selection" }
  | { type: "cancel-ai-analysis" }
  | { type: "export-one"; nodeId: string; config: ExportConfig; semanticNames?: Record<string, string> }
  | { type: "export"; config: ExportConfig; semanticNames?: Record<string, string> };
