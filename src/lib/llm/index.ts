import { z } from "zod";
import { getEnv } from "../config/env";
import { MissingCredentialError, ProviderError } from "../errors";
import { anthropicComplete } from "./anthropic";
import { geminiComplete } from "./gemini";
import type { CompleteTextInput, LlmProvider } from "./types";

export type { CompleteTextInput, LlmProvider } from "./types";

/**
 * Cliente LLM compartido y agnóstico del proveedor. Todos los módulos que necesiten IA (análisis,
 * oportunidades, mensajes, informes) pasan por aquí: un único punto de configuración, reintentos y
 * manejo de errores. Proveedores: Anthropic (ANTHROPIC_API_KEY) y Google AI Studio (GEMINI_API_KEY).
 */

export const PROVIDER_LABELS: Record<LlmProvider, string> = { anthropic: "Anthropic (Claude)", gemini: "Google AI Studio (Gemini)" };
export const LLM_KEY_VARS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"] as const;
export const LLM_KEYS_HINT = "ANTHROPIC_API_KEY o GEMINI_API_KEY";

export interface LlmInfo {
  provider: LlmProvider;
  model: string;
}

/**
 * Proveedor activo: el forzado con LLM_PROVIDER si tiene clave; si no, el que tenga clave
 * (Anthropic primero si hay ambas). `undefined` = ninguna IA configurada.
 */
export function getLlmInfo(): LlmInfo | undefined {
  const env = getEnv();
  const has: Record<LlmProvider, boolean> = { anthropic: Boolean(env.ANTHROPIC_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) };
  const provider: LlmProvider | undefined =
    env.LLM_PROVIDER && has[env.LLM_PROVIDER] ? env.LLM_PROVIDER : has.anthropic ? "anthropic" : has.gemini ? "gemini" : undefined;
  if (!provider) return undefined;
  return { provider, model: provider === "anthropic" ? env.ANTHROPIC_MODEL : env.GEMINI_MODEL };
}

export const isLlmConfigured = () => getLlmInfo() !== undefined;

/** Lanza MissingCredentialError si no hay ninguna clave de IA. */
export function llmMissingError(feature = "IA"): MissingCredentialError {
  const e = new MissingCredentialError(`la IA (${feature})`, [...LLM_KEY_VARS]);
  e.message = `Falta configurar la IA (${feature}): define ${LLM_KEYS_HINT} en .env.local`;
  return e;
}

export function requireLlm(feature = "IA"): LlmInfo {
  const info = getLlmInfo();
  if (!info) throw llmMissingError(feature);
  return info;
}

export async function completeText(input: CompleteTextInput): Promise<string> {
  const { provider } = requireLlm();
  return provider === "gemini" ? geminiComplete(input) : anthropicComplete(input);
}

/** Pide JSON y lo valida con zod. Reintenta una vez si la respuesta no valida. */
export async function completeJson<T extends z.ZodType>(
  input: CompleteTextInput & { schema: T },
): Promise<z.infer<T>> {
  const system = `${input.system}\n\nResponde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código.`;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? input.prompt : `${input.prompt}\n\nTu respuesta anterior no era válida (${lastError}). Devuelve solo JSON válido.`;
    const text = await completeText({ ...input, system, prompt, json: true });
    try {
      const json = JSON.parse(extractJson(text));
      return input.schema.parse(json);
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 600) : "formato incorrecto";
    }
  }
  throw new ProviderError(getLlmInfo()?.provider ?? "llm", `Respuesta no válida tras reintento: ${lastError}`);
}

export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
