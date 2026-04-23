import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUDIO_MIME_TYPE,
  MAX_BASE64_MEDIA_BYTES,
  MimoApiError,
  type AttachmentKind,
  type HistoryMessage,
  type MediaAttachment,
  type TextModelPreference,
  type VoiceOption,
  generateChatReply,
  generateSpeechAudio,
  getEffectiveUserPrompt,
  resolveAppliedStyle
} from "./mimo.js";

type FetchLike = typeof fetch;

type DesktopConfigController = {
  hasApiKey: () => boolean | Promise<boolean>;
  saveApiKey: (apiKey: string) => void | Promise<void>;
  restartApp: () => void | Promise<void>;
};

type ChatSpeakBody = {
  message?: string;
  history?: HistoryMessage[];
  attachments?: MediaAttachment[];
  textModel?: TextModelPreference;
  voice?: VoiceOption;
  presetStyle?: string;
  customStyle?: string;
  skipTts?: boolean;
};

const VALID_VOICES: VoiceOption[] = [
  "mimo_default",
  "冰糖",
  "茉莉",
  "苏打",
  "白桦",
  "Mia",
  "Chloe",
  "Milo",
  "Dean",
  "default_en",
  "default_zh"
];
const VALID_ATTACHMENT_KINDS: AttachmentKind[] = ["image", "audio", "video"];
const VALID_TEXT_MODELS: TextModelPreference[] = ["mimo-v2.5", "mimo-v2.5-pro"];
type ParsedChatRequest = {
  message: string;
  normalizedHistory: HistoryMessage[];
  normalizedCurrentAttachments: MediaAttachment[];
  preferredTextModel?: TextModelPreference;
  voice: VoiceOption;
  appliedStyle: string | null;
  effectiveUserPrompt: string;
};
type ParsedChatRequestResult =
  | {
      error: {
        status: number;
        code: string;
        message: string;
      };
    }
  | {
      value: ParsedChatRequest;
    };

function getProjectRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "..");
}

function sendError(response: Response, status: number, code: string, message: string) {
  return response.status(status).json({
    error: {
      code,
      message
    }
  });
}

function isProbablyBase64DataUrl(dataUrl: string) {
  return /^data:[^;]+;base64,[A-Za-z0-9+/=\s]+$/.test(dataUrl);
}

function isSupportedMimeType(kind: AttachmentKind, mimeType: string) {
  if (kind === "image") {
    return mimeType.startsWith("image/");
  }

  if (kind === "audio") {
    return [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/flac",
      "audio/x-flac",
      "audio/mp4",
      "audio/m4a",
      "audio/ogg"
    ].includes(mimeType);
  }

  return [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-ms-wmv"
  ].includes(mimeType);
}

function isWithinBase64Limit(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  const base64Payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Buffer.byteLength(base64Payload, "utf8") <= MAX_BASE64_MEDIA_BYTES;
}

function normalizeAttachments(input: unknown): MediaAttachment[] | null {
  if (input == null) {
    return [];
  }

  if (!Array.isArray(input)) {
    return null;
  }

  const normalized = input.filter(
    (entry): entry is MediaAttachment =>
      Boolean(entry) &&
      VALID_ATTACHMENT_KINDS.includes(entry.kind) &&
      typeof entry.name === "string" &&
      typeof entry.mimeType === "string" &&
      typeof entry.dataUrl === "string"
  );

  return normalized;
}

function validateAttachments(attachments: MediaAttachment[]) {
  for (const attachment of attachments) {
    if (!isSupportedMimeType(attachment.kind, attachment.mimeType)) {
      return `Unsupported ${attachment.kind} MIME type: ${attachment.mimeType}`;
    }

    if (!isProbablyBase64DataUrl(attachment.dataUrl)) {
      return `Attachment ${attachment.name} must be a base64 data URL.`;
    }

    if (!isWithinBase64Limit(attachment.dataUrl)) {
      return `Attachment ${attachment.name} exceeds MiMo's 10 MB base64 limit.`;
    }
  }

  return null;
}

function parseChatRequest(body: ChatSpeakBody | undefined): ParsedChatRequestResult {
  const {
    message = "",
    history = [],
    attachments: currentAttachmentsInput,
    textModel,
    voice = "mimo_default",
    presetStyle,
    customStyle
  } = body ?? {};

  if (!Array.isArray(history)) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "history must be an array."
      }
    } as const;
  }

  if (!VALID_VOICES.includes(voice)) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "voice is invalid."
      }
    } as const;
  }

  if (textModel != null && !VALID_TEXT_MODELS.includes(textModel)) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "textModel is invalid."
      }
    } as const;
  }

  const normalizedCurrentAttachments = normalizeAttachments(currentAttachmentsInput);
  if (!normalizedCurrentAttachments) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "attachments must be an array."
      }
    } as const;
  }

  const attachmentValidationError = validateAttachments(normalizedCurrentAttachments);
  if (attachmentValidationError) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: attachmentValidationError
      }
    } as const;
  }

  if (!message.trim() && normalizedCurrentAttachments.length === 0) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "message or attachments are required."
      }
    } as const;
  }

  const normalizedHistory = history.flatMap((entry) => {
    if (!entry || (entry.role !== "user" && entry.role !== "assistant") || typeof entry.content !== "string") {
      return [];
    }

    const normalizedAttachments = normalizeAttachments(entry.attachments);
    if (normalizedAttachments == null) {
      return [];
    }

    return [
      {
        role: entry.role,
        content: entry.content,
        attachments: entry.role === "user" ? normalizedAttachments : undefined
      } satisfies HistoryMessage
    ];
  });

  const historyValidationError = normalizedHistory
    .filter((entry) => entry.role === "user")
    .map((entry) => validateAttachments(entry.attachments ?? []))
    .find(Boolean);

  if (historyValidationError) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: historyValidationError
      }
    } as const;
  }

  return {
    value: {
      message,
      normalizedHistory,
      normalizedCurrentAttachments,
      preferredTextModel: textModel,
      voice,
      appliedStyle: resolveAppliedStyle(presetStyle, customStyle),
      effectiveUserPrompt: getEffectiveUserPrompt(message, normalizedCurrentAttachments)
    } satisfies ParsedChatRequest
  } as const;
}

function hasParsedRequestError(result: ParsedChatRequestResult): result is Extract<ParsedChatRequestResult, { error: unknown }> {
  return "error" in result;
}

export function createApp({
  apiKey = process.env.MIMO_API_KEY,
  fetchFn = fetch,
  desktopConfig
}: {
  apiKey?: string;
  fetchFn?: FetchLike;
  desktopConfig?: DesktopConfigController;
} = {}) {
  const app = express();
  const projectRoot = getProjectRoot();
  const distPath = path.join(projectRoot, "dist");

  app.use(express.json({ limit: "30mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/desktop-config", async (_request, response) => {
    const hasApiKey = desktopConfig ? await desktopConfig.hasApiKey() : Boolean(apiKey);

    response.json({
      enabled: Boolean(desktopConfig),
      hasApiKey
    });
  });

  app.post(
    "/api/desktop-config/api-key",
    async (request: Request<Record<string, never>, unknown, { apiKey?: string }>, response) => {
      if (!desktopConfig) {
        return sendError(response, 404, "DESKTOP_CONFIG_DISABLED", "Desktop API key configuration is not available.");
      }

      const nextApiKey = request.body?.apiKey?.trim();
      if (!nextApiKey) {
        return sendError(response, 400, "VALIDATION_ERROR", "MIMO_API_KEY is required.");
      }

      try {
        await desktopConfig.saveApiKey(nextApiKey);

        response.json({
          ok: true,
          hasApiKey: true,
          restartRequired: true
        });
      } catch (error) {
        console.error("Failed to save desktop API key:", error);
        return sendError(response, 500, "CONFIG_WRITE_ERROR", "Unable to save MIMO_API_KEY.");
      }
    }
  );

  app.post("/api/desktop-config/restart", async (_request, response) => {
    if (!desktopConfig) {
      return sendError(response, 404, "DESKTOP_CONFIG_DISABLED", "Desktop restart is not available.");
    }

    response.json({ ok: true });
    response.on("finish", () => {
      setTimeout(() => {
        void desktopConfig.restartApp();
      }, 250);
    });
  });

  app.post("/api/chat", async (request: Request<Record<string, never>, unknown, ChatSpeakBody>, response) => {
    if (!apiKey) {
      return sendError(response, 500, "CONFIG_ERROR", "Missing MIMO_API_KEY in the local server.");
    }

    const parsedRequest = parseChatRequest(request.body);
    if (hasParsedRequestError(parsedRequest)) {
      return sendError(
        response,
        parsedRequest.error.status,
        parsedRequest.error.code,
        parsedRequest.error.message
      );
    }

    const { message, normalizedHistory, normalizedCurrentAttachments, preferredTextModel } = parsedRequest.value;

    try {
      const { replyText, modelUsed } = await generateChatReply(
        apiKey,
        normalizedHistory,
        message,
        normalizedCurrentAttachments,
        fetchFn,
        preferredTextModel
      );

      response.json({
        replyText,
        modelUsed
      });
    } catch (error) {
      if (error instanceof MimoApiError) {
        return sendError(response, error.status, error.code, error.message);
      }

      return sendError(response, 500, "INTERNAL_ERROR", "Unexpected local server error.");
    }
  });

  app.post(
    "/api/chat-speak",
    async (request: Request<Record<string, never>, unknown, ChatSpeakBody>, response) => {
      if (!apiKey) {
        return sendError(response, 500, "CONFIG_ERROR", "Missing MIMO_API_KEY in the local server.");
      }

      const parsedRequest = parseChatRequest(request.body);
      if (hasParsedRequestError(parsedRequest)) {
        return sendError(
          response,
          parsedRequest.error.status,
          parsedRequest.error.code,
          parsedRequest.error.message
        );
      }

      const {
        message,
        normalizedHistory,
        normalizedCurrentAttachments,
        preferredTextModel,
        voice,
        appliedStyle,
        effectiveUserPrompt
      } = parsedRequest.value;
      const skipTts = Boolean(request.body?.skipTts);

      try {
        const { replyText, modelUsed } = await generateChatReply(
          apiKey,
          normalizedHistory,
          message,
          normalizedCurrentAttachments,
          fetchFn,
          preferredTextModel,
          skipTts ? "text" : "speech"
        );

        if (skipTts) {
          return response.json({
            replyText,
            modelUsed
          });
        }

        const audio = await generateSpeechAudio(
          apiKey,
          effectiveUserPrompt,
          replyText,
          voice,
          appliedStyle,
          fetchFn
        );

        response.json({
          replyText,
          audioBase64: audio.audioBase64,
          audioMimeType: AUDIO_MIME_TYPE,
          appliedStyle,
          modelUsed
        });
      } catch (error) {
        if (error instanceof MimoApiError) {
          return sendError(response, error.status, error.code, error.message);
        }

        return sendError(response, 500, "INTERNAL_ERROR", "Unexpected local server error.");
      }
    }
  );

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/^(?!\/api).*/, (_request, response) => {
      response.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}
