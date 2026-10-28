import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../config/env";
import { MissingCredentialError, ProviderError } from "../errors";
import type { CompleteTextInput } from "./types";

let client: Anthropic | undefined;
let clientKey: string | undefined;

function getClient(): Anthropic {
  const { ANTHROPIC_API_KEY } = getEnv();
  if (!ANTHROPIC_API_KEY) throw new MissingCredentialError("Anthropic", ["ANTHROPIC_API_KEY"]);
  if (!client || clientKey !== ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 });
    clientKey = ANTHROPIC_API_KEY;
  }
  return client;
}

/** Proveedor Anthropic (Claude). Se usa a través de `@/lib/llm`, no directamente. */
export async function anthropicComplete(input: CompleteTextInput): Promise<string> {
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
