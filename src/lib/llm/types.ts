export type LlmProvider = "anthropic" | "gemini";

export interface CompleteTextInput {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Sobrescribe el modelo del proveedor activo (normalmente se deja el configurado en el entorno). */
  model?: string;
  /** Pide al proveedor que responda en JSON (lo usa `completeJson`). */
  json?: boolean;
}
