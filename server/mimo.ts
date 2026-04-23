const MIMO_CHAT_COMPLETIONS_URL = "https://api.xiaomimimo.com/v1/chat/completions";
const CHAT_MODEL = "mimo-v2-pro";
const OMNI_MODEL = "mimo-v2-omni";
const CHAT_MODEL_V25 = "mimo-v2.5";
const CHAT_MODEL_V25_PRO = "mimo-v2.5-pro";
const TTS_MODEL = "mimo-v2.5-tts";

export const AUDIO_MIME_TYPE = "audio/wav";
export const MAX_BASE64_MEDIA_BYTES = 10 * 1024 * 1024;

export type AttachmentKind = "image" | "audio" | "video";
export type VoiceOption =
  | "mimo_default"
  | "冰糖"
  | "茉莉"
  | "苏打"
  | "白桦"
  | "Mia"
  | "Chloe"
  | "Milo"
  | "Dean"
  | "default_en"
  | "default_zh";
export type TextModelPreference = typeof CHAT_MODEL_V25 | typeof CHAT_MODEL_V25_PRO;
export type TextModel = typeof CHAT_MODEL | typeof OMNI_MODEL | TextModelPreference;
export type ChatOutputMode = "text" | "speech";

export type MediaAttachment = {
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: MediaAttachment[];
};

type FetchLike = typeof fetch;

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
type AudioPart = { type: "input_audio"; input_audio: { data: string } };
type VideoPart = {
  type: "video_url";
  video_url: { url: string };
  fps: number;
  media_resolution: "default";
};

type UserContentPart = TextPart | ImagePart | AudioPart | VideoPart;
type ChatMessageContent = string | UserContentPart[] | undefined;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: ChatMessageContent;
      audio?: {
        data?: string;
      };
    };
  }>;
  error?: {
    message?: string;
  };
};

export class MimoApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "MIMO_API_ERROR") {
    super(message);
    this.name = "MimoApiError";
    this.status = status;
    this.code = code;
  }
}

export function resolveAppliedStyle(presetStyle?: string, customStyle?: string): string | null {
  const normalizedCustom = customStyle?.trim();
  if (normalizedCustom) {
    return normalizedCustom;
  }

  const normalizedPreset = presetStyle?.trim();
  return normalizedPreset ? normalizedPreset : null;
}

export function buildTtsContent(replyText: string, appliedStyle: string | null): string {
  if (!appliedStyle) {
    return replyText;
  }

  return `(${appliedStyle})${replyText}`;
}

export function normalizeVoiceOption(voice: VoiceOption): Exclude<VoiceOption, "default_en" | "default_zh"> {
  if (voice === "default_zh") {
    return "冰糖";
  }

  if (voice === "default_en") {
    return "Mia";
  }

  return voice;
}

export function getDefaultAttachmentPrompt(): string {
  return "请分析我上传的内容，并提炼其中最重要的信息。";
}

export function getEffectiveUserPrompt(message: string, attachments: MediaAttachment[] = []): string {
  const trimmedMessage = message.trim();
  if (trimmedMessage) {
    return trimmedMessage;
  }

  return attachments.length > 0 ? getDefaultAttachmentPrompt() : "";
}

export function selectTextModel(
  history: HistoryMessage[] = [],
  attachments: MediaAttachment[] = [],
  preferredModel?: TextModelPreference
): TextModel {
  const hasHistoryAttachments = history.some((message) => (message.attachments?.length ?? 0) > 0);
  const hasMedia = attachments.length > 0 || hasHistoryAttachments;

  if (preferredModel) {
    return hasMedia ? CHAT_MODEL_V25 : preferredModel;
  }

  return hasMedia ? OMNI_MODEL : CHAT_MODEL;
}

export function buildUserContent(
  message: string,
  attachments: MediaAttachment[] = []
): string | UserContentPart[] {
  const prompt = getEffectiveUserPrompt(message, attachments);

  if (attachments.length === 0) {
    return prompt;
  }

  const parts = attachments.map((attachment) => mapAttachmentToContentPart(attachment));
  parts.push({
    type: "text",
    text: prompt
  });

  return parts;
}

function mapAttachmentToContentPart(attachment: MediaAttachment): UserContentPart {
  switch (attachment.kind) {
    case "image":
      return {
        type: "image_url",
        image_url: {
          url: attachment.dataUrl
        }
      };
    case "audio":
      return {
        type: "input_audio",
        input_audio: {
          data: attachment.dataUrl
        }
      };
    case "video":
      return {
        type: "video_url",
        video_url: {
          url: attachment.dataUrl
        },
        fps: 2,
        media_resolution: "default"
      };
  }
}

function formatHistoryMessage(message: HistoryMessage) {
  if (message.role === "assistant") {
    return {
      role: "assistant" as const,
      content: message.content
    };
  }

  return {
    role: "user" as const,
    content: buildUserContent(message.content, message.attachments ?? [])
  };
}

function buildDeveloperPrompt(outputMode: ChatOutputMode = "text") {
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date());

  const prompt = [
    "You are MiMo, an AI assistant developed by Xiaomi.",
    `Today's date is ${today}.`,
    "Your knowledge cutoff date is December 2024.",
    "Reply in the same language as the user unless they ask for another language.",
    "If the user uploads image, audio, or video, ground your answer in the provided media.",
    "Keep answers helpful, natural, and concise enough to sound good when spoken aloud."
  ];

  if (outputMode === "speech") {
    prompt.push(
      "This request is in voice chat mode: the app will synthesize your final answer with MiMo-V2.5-TTS and play it aloud.",
      "Never say that you cannot speak, read aloud, make sound, or produce audio; the app handles audio generation.",
      "If the user asks you to read, recite, narrate, 朗读, 念, or 读出来 provided text, return only the text/script that should be spoken, preserving the user's wording, punctuation, and line breaks as much as possible.",
      "Do not add meta commentary such as '好的，我来朗读' unless the user explicitly asks for an introduction."
    );
  }

  return prompt.join(" ");
}

function extractTextContent(content: ChatMessageContent): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text ?? "" : ""))
      .join("")
      .trim();
  }

  return "";
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ChatCompletionResponse;
    return payload.error?.message ?? `MiMo API returned status ${response.status}.`;
  } catch {
    return `MiMo API returned status ${response.status}.`;
  }
}

async function callMimoApi(
  apiKey: string,
  body: Record<string, unknown>,
  fetchFn: FetchLike
): Promise<ChatCompletionResponse> {
  const response = await fetchFn(MIMO_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new MimoApiError(await parseError(response), response.status);
  }

  return (await response.json()) as ChatCompletionResponse;
}

export async function generateChatReply(
  apiKey: string,
  history: HistoryMessage[],
  message: string,
  attachments: MediaAttachment[] = [],
  fetchFn: FetchLike = fetch,
  preferredModel?: TextModelPreference,
  outputMode: ChatOutputMode = "text"
): Promise<{ replyText: string; modelUsed: TextModel }> {
  const modelUsed = selectTextModel(history, attachments, preferredModel);
  const payload = await callMimoApi(
    apiKey,
    {
      model: modelUsed,
      messages: [
        {
          role: "developer",
          content: buildDeveloperPrompt(outputMode)
        },
        ...history.map((entry) => formatHistoryMessage(entry)),
        {
          role: "user",
          content: buildUserContent(message, attachments)
        }
      ],
      max_completion_tokens: 1024,
      temperature: 0.7
    },
    fetchFn
  );

  const replyText = extractTextContent(payload.choices?.[0]?.message?.content);

  if (!replyText) {
    throw new MimoApiError("MiMo chat response did not include any text.", 502, "MIMO_EMPTY_CHAT");
  }

  return {
    replyText,
    modelUsed
  };
}

export async function generateSpeechAudio(
  apiKey: string,
  userMessage: string,
  replyText: string,
  voice: VoiceOption,
  appliedStyle: string | null,
  fetchFn: FetchLike = fetch
): Promise<{ audioBase64: string; audioMimeType: typeof AUDIO_MIME_TYPE }> {
  const payload = await callMimoApi(
    apiKey,
    {
      model: TTS_MODEL,
      messages: [
        {
          role: "user",
          content: userMessage
        },
        {
          role: "assistant",
          content: buildTtsContent(replyText, appliedStyle)
        }
      ],
      audio: {
        format: "wav",
        voice: normalizeVoiceOption(voice)
      }
    },
    fetchFn
  );

  const audioBase64 = payload.choices?.[0]?.message?.audio?.data?.trim();

  if (!audioBase64) {
    throw new MimoApiError("MiMo TTS response did not include audio data.", 502, "MIMO_EMPTY_AUDIO");
  }

  return {
    audioBase64,
    audioMimeType: AUDIO_MIME_TYPE
  };
}
