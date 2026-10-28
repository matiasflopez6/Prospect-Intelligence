import type { MessageChannel } from "@/domain";

export interface GeneratedMessage {
  channel: MessageChannel;
  /** Solo email. */
  subject?: string;
  body: string;
  /** IDs de evidence en las que se apoya (todo dato citado debe tener evidencia). */
  evidenceIds: number[];
  opportunityId?: number;
  model?: string;
}

export interface GenerateMessagesInput {
  companyId: number;
  channels: MessageChannel[];
  /** Oportunidad sobre la que abrir la conversación; por defecto la de mayor prioridad. */
  opportunityId?: number;
  language?: string;
}
