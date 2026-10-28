import { isLlmConfigured, LLM_KEYS_HINT } from "@/lib/llm";
import { errorMessage } from "@/lib/errors";
import { createLlmInterpreter } from "./llm-interpreter";
import { createRuleInterpreter } from "./rule-interpreter";
import type { AnalysisInterpreter } from "./types";

/**
 * Intérprete por defecto: IA (ANTHROPIC_API_KEY o GEMINI_API_KEY) con verificación de evidencias; si no hay clave
 * o la IA falla, reglas deterministas. El motivo del respaldo queda en `fallbackReason`.
 */
export function createInterpreter(): AnalysisInterpreter {
  const rules = createRuleInterpreter();
  return {
    async interpret(input) {
      if (!isLlmConfigured()) {
        const result = await rules.interpret(input);
        return { ...result, fallbackReason: `Sin ${LLM_KEYS_HINT}: interpretación por reglas deterministas` };
      }
      try {
        return await createLlmInterpreter().interpret(input);
      } catch (e) {
        const result = await rules.interpret(input);
        return { ...result, fallbackReason: `La IA no estuvo disponible (${errorMessage(e).slice(0, 200)}): interpretación por reglas` };
      }
    },
  };
}
