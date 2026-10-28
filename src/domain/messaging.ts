export const MESSAGE_CHANNELS = ["email", "linkedin", "whatsapp"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

export const MESSAGE_STATUSES = ["draft", "approved", "sent"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
