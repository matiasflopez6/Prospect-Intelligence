import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getEnv } from "../config/env";
import { MissingCredentialError, ProviderError } from "../errors";

/**
 * Cliente LLM compartido. Todos los módulos que necesiten IA pasan por aquí
 * (análisis, oportunidades, mensajes, informes) para tener un único punto de
 * configuración, reintentos y manejo de errores.
 */

let client: Anthropic | undefined;

function getClient(): Anthropic {
  const { ANTHROPIC_API_KEY } = getEnv();
  if (!ANTHROPIC_API_KEY) throw new MissingCredentialError("Anthropic", ["ANTHROPIC_API_KEY"]);
  return (client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 }));
}

export interface CompleteTextInput {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
}

export async function completeText(input: CompleteTextInput): Promise<string> {
  const model = input.model ?? getEnv().ANTHROPIC_MODEL;
  try {
    const res = await getClient().messages.create({
      model,
      max_tokens: input.maxTokens ?? 2048,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
    });
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  } catch (e) {
    if (e instanceof MissingCredentialError) throw e;
    throw new ProviderError("anthropic", e instanceof Error ? e.message : String(e));
  }
}

/** Pide JSON y lo valida con zod. Reintenta una vez si la respuesta no valida. */
export async function completeJson<T extends z.ZodType>(
  input: CompleteTextInput & { schema: T },
): Promise<z.infer<T>> {
  const system = `${input.system}\n\nResponde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código.`;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? input.prompt : `${input.prompt}\n\nTu respuesta anterior no era válida (${lastError}). Devuelve solo JSON válido.`;
    const text = await completeText({ ...input, system, prompt });
    try {
      const json = JSON.parse(extractJson(text));
      return input.schema.parse(json);
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 300) : "formato incorrecto";
    }
  }
  throw new ProviderError("anthropic", `Respuesta no válida tras reintento: ${lastError}`);
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
