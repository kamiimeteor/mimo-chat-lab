import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Bot,
  Film,
  ImageIcon,
  LoaderCircle,
  Plus,
  SendHorizonal,
  Sparkles,
  Trash2,
  UserRound,
  Volume2,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_ACCEPT,
  MAX_LOCAL_UPLOAD_BYTES,
  NO_STYLE_VALUE,
  STYLE_OPTIONS,
  VOICE_OPTIONS,
  type VoiceOption
} from "./constants";

type ChatRole = "user" | "assistant";
type ChatTab = "chat" | "speak";
type ModelUsed = "mimo-v2-pro" | "mimo-v2-omni" | "mimo-v2.5" | "mimo-v2.5-pro";
type ChatModelChoice = "mimo-v2.5" | "mimo-v2.5-pro";
type AttachmentKind = "image" | "audio" | "video";

type Attachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
};

type Message = {
  id: string;
  role: ChatRole;
  content: string;
  attachments?: Attachment[];
  audioSrc?: string;
  appliedStyle?: string | null;
  modelUsed?: ModelUsed;
};

type ChatResponse = {
  replyText: string;
  modelUsed: ModelUsed;
};

type SpeakResponse = ChatResponse & {
  audioBase64: string;
  audioMimeType: "audio/wav";
  appliedStyle: string | null;
};

const defaultPrompt = "";
const CHAT_MODEL_OPTIONS: Array<{ label: string; value: ChatModelChoice }> = [
  { label: "MiMo-V2.5", value: "mimo-v2.5" },
  { label: "MiMo-V2.5-Pro", value: "mimo-v2.5-pro" }
];

function detectAttachmentKind(file: File): AttachmentKind | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function attachmentIcon(kind: AttachmentKind) {
  if (kind === "image") {
    return ImageIcon;
  }

  if (kind === "video") {
    return Film;
  }

  return AudioLines;
}

function attachmentLabel(kind: AttachmentKind) {
  if (kind === "image") {
    return "图片";
  }

  if (kind === "video") {
    return "视频";
  }

  return "音频";
}

function App() {
  const [activeTab, setActiveTab] = useState<ChatTab>("chat");
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [speakMessages, setSpeakMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState(defaultPrompt);
  const [speakInput, setSpeakInput] = useState(defaultPrompt);
  const [chatAttachments, setChatAttachments] = useState<Attachment[]>([]);
  const [speakAttachments, setSpeakAttachments] = useState<Attachment[]>([]);
  const [selectedChatModel, setSelectedChatModel] = useState<ChatModelChoice>("mimo-v2.5");
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>("default_zh");
  const [presetStyle, setPresetStyle] = useState("");
  const [customStyle, setCustomStyle] = useState("");
  const [loadingTab, setLoadingTab] = useState<ChatTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const speakFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMessages = activeTab === "chat" ? chatMessages : speakMessages;
  const activeInput = activeTab === "chat" ? chatInput : speakInput;
  const activeAttachments = activeTab === "chat" ? chatAttachments : speakAttachments;
  const activeFileInputRef = activeTab === "chat" ? chatFileInputRef : speakFileInputRef;
  const isLoading = loadingTab !== null;
  const isActiveTabLoading = loadingTab === activeTab;
  const chatHistoryHasMedia = useMemo(
    () => chatMessages.some((message) => message.role === "user" && (message.attachments?.length ?? 0) > 0),
    [chatMessages]
  );
  const speakHistoryHasMedia = useMemo(
    () => speakMessages.some((message) => message.role === "user" && (message.attachments?.length ?? 0) > 0),
    [speakMessages]
  );
  const effectiveChatModel: ModelUsed =
    selectedChatModel === "mimo-v2.5-pro" && (chatAttachments.length > 0 || chatHistoryHasMedia)
      ? "mimo-v2.5"
      : selectedChatModel;
  const effectiveSpeakModel: ModelUsed =
    speakAttachments.length > 0 || speakHistoryHasMedia ? "mimo-v2-omni" : "mimo-v2-pro";
  const currentModelLabel = activeTab === "chat" ? effectiveChatModel : effectiveSpeakModel;
  const canSubmit = (activeInput.trim().length > 0 || activeAttachments.length > 0) && !isLoading;

  const speakHelperText = useMemo(() => {
    if (customStyle.trim()) {
      return `当前将优先使用自定义风格：${customStyle.trim()}`;
    }

    if (presetStyle) {
      return `当前使用官方示例风格：${presetStyle}`;
    }

    return "当前未设置风格，将使用自然默认朗读。";
  }, [customStyle, presetStyle]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeMessages, isActiveTabLoading]);

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }

    setError(null);

    try {
      const nextAttachments = await Promise.all(
        Array.from(fileList).map(async (file) => {
          const kind = detectAttachmentKind(file);

          if (!kind) {
            throw new Error(`暂不支持的文件类型：${file.name}`);
          }

          if (activeTab === "chat" && kind === "audio") {
            throw new Error("默认聊天 tab 仅支持图片或视频；如果要上传音频，请切到“语音聊天”tab。");
          }

          if (file.size > MAX_LOCAL_UPLOAD_BYTES) {
            throw new Error(`${file.name} 太大了。由于 MiMo 的 Base64 限制，请把单个文件控制在 7.5 MB 以内。`);
          }

          const dataUrl = await readFileAsDataUrl(file);

          return {
            id: crypto.randomUUID(),
            kind,
            name: file.name,
            mimeType: file.type,
            dataUrl,
            sizeBytes: file.size
          } satisfies Attachment;
        })
      );

      if (activeTab === "chat") {
        setChatAttachments((current) => [...current, ...nextAttachments]);
      } else {
        setSpeakAttachments((current) => [...current, ...nextAttachments]);
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "读取附件时发生未知错误。";
      setError(message);
    } finally {
      event.target.value = "";
    }
  }

  function handleRemoveAttachment(id: string) {
    if (activeTab === "chat") {
      setChatAttachments((current) => current.filter((attachment) => attachment.id !== id));
      return;
    }

    setSpeakAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (canSubmit) {
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const requestTab = activeTab;
    const requestInput = activeInput.trim();
    const requestAttachments = activeAttachments;
    const nextUserMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: requestInput,
      attachments: requestAttachments
    };

    const history = activeMessages.map(({ role, content, attachments: messageAttachments }) => ({
      role,
      content,
      attachments: messageAttachments?.map(({ kind, name, mimeType, dataUrl }) => ({
        kind,
        name,
        mimeType,
        dataUrl
      }))
    }));

    setError(null);
    setLoadingTab(requestTab);
    if (requestTab === "chat") {
      setChatMessages((current) => [...current, nextUserMessage]);
    } else {
      setSpeakMessages((current) => [...current, nextUserMessage]);
    }
    if (requestTab === "chat") {
      setChatInput("");
      setChatAttachments([]);
    } else {
      setSpeakInput("");
      setSpeakAttachments([]);
    }

    try {
      const response = await fetch("/api/chat-speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: nextUserMessage.content,
          history,
          attachments: nextUserMessage.attachments?.map(({ kind, name, mimeType, dataUrl }) => ({
            kind,
            name,
            mimeType,
            dataUrl
          })),
          skipTts: requestTab === "chat",
          textModel: requestTab === "chat" ? selectedChatModel : undefined,
          ...(requestTab === "speak"
            ? {
                voice: selectedVoice,
                presetStyle,
                customStyle
              }
            : {})
        })
      });

      const payload = (await response.json()) as
        | (ChatResponse & { error?: { message?: string } })
        | (SpeakResponse & { error?: { message?: string } });

      if (!response.ok || !("replyText" in payload)) {
        throw new Error(payload.error?.message ?? "请求 MiMo 接口失败，请稍后再试。");
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: payload.replyText,
        modelUsed: payload.modelUsed
      };

      if (requestTab === "speak" && "audioBase64" in payload) {
        assistantMessage.audioSrc = `data:${payload.audioMimeType};base64,${payload.audioBase64}`;
        assistantMessage.appliedStyle = payload.appliedStyle;
      }

      if (requestTab === "chat") {
        setChatMessages((current) => [...current, assistantMessage]);
      } else {
        setSpeakMessages((current) => [...current, assistantMessage]);
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "发生未知错误。";
      setError(message);
    } finally {
      setLoadingTab(null);
    }
  }

  function handleClearConversation() {
    if (activeTab === "chat") {
      setChatMessages([]);
      setChatAttachments([]);
    } else {
      setSpeakMessages([]);
      setSpeakAttachments([]);
    }
    setError(null);
  }

  const activeAttachmentAccept = activeTab === "chat" ? CHAT_ATTACHMENT_ACCEPT : ATTACHMENT_ACCEPT;
  const activeTabDescription =
    activeTab === "chat"
      ? "默认模式：发送文字、图片、视频，只返回文字结果。你可以手动选 MiMo-V2.5 或 MiMo-V2.5-Pro；带图片或视频时会自动使用 MiMo-V2.5。"
      : "语音聊天模式：保留原来的文字回复 + 语音合成 + 自动播放能力，也支持上传音频继续分析。";
  const loadingText =
    activeTab === "chat" ? "正在调用模型，请稍候…" : "正在调用模型并生成语音，请稍候…";

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="space-y-6">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="accent" className="rounded-full px-3 py-1 text-[11px] tracking-[0.24em] uppercase">
              MiMo Localhost MVP
            </Badge>
            <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
              <Sparkles className="size-3.5" />
              mimo-v2.5-pro
            </Badge>
            <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
              <Film className="size-3.5" />
              mimo-v2.5
            </Badge>
            <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
              <Volume2 className="size-3.5" />
              mimo-v2.5-tts
            </Badge>
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
              先回答，再决定要不要开口说话
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              默认 tab 现在适合直接发文字、图片、视频来聊天；如果你希望保留自动语音回复和播放，切到“语音聊天”
              tab 就可以继续使用原来的体验。
            </p>
          </div>
        </div>

        <Card className="glass-panel border-white/70">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Bot className="size-5 text-primary" />
                    对话
                  </CardTitle>
                  <CardDescription>同一段历史里自由切换默认聊天和语音聊天模式。</CardDescription>
                </div>

                <div className="inline-flex rounded-full border border-border/70 bg-background/80 p-1 shadow-sm">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                      activeTab === "chat"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    onClick={() => {
                      setActiveTab("chat");
                      setError(null);
                    }}
                  >
                    <Sparkles className="size-4" />
                    默认聊天
                  </button>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                      activeTab === "speak"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    onClick={() => {
                      setActiveTab("speak");
                      setError(null);
                    }}
                  >
                    <Volume2 className="size-4" />
                    语音聊天
                  </button>
                </div>

                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{activeTabDescription}</p>
              </div>

              <Badge variant="outline" className="rounded-full px-3 py-1">
                {activeMessages.length} 条消息
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-0 p-0">
            <ScrollArea className="h-[520px] px-6">
              <div className="space-y-4">
                {activeMessages.length === 0 ? (
                  <div className="mt-1 rounded-3xl border border-dashed bg-background/60 px-6 py-10 text-center">
                    <p className="font-medium">还没有消息</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {activeTab === "chat"
                        ? "你可以直接发文字、图片或视频。默认 tab 不会自动生成语音。"
                        : "你可以继续使用原来的语音回复流程，也可以上传图片、视频或音频一起分析。"}
                    </p>
                  </div>
                ) : (
                  activeMessages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.role === "user"
                          ? "ml-auto max-w-[92%] rounded-[28px] border border-primary/10 bg-secondary/80 p-5 shadow-sm"
                          : "mr-auto max-w-[92%] rounded-[28px] border border-primary/12 bg-gradient-to-br from-background to-accent/40 p-5 shadow-sm"
                      }
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge variant={message.role === "user" ? "secondary" : "accent"} className="gap-1.5 rounded-full px-3 py-1">
                          {message.role === "user" ? <UserRound className="size-3.5" /> : <Bot className="size-3.5" />}
                          {message.role === "user" ? "你" : "MiMo"}
                        </Badge>
                        {message.modelUsed ? (
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            {message.modelUsed}
                          </Badge>
                        ) : null}
                        {message.role === "assistant" && message.appliedStyle ? (
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            Style: {message.appliedStyle}
                          </Badge>
                        ) : null}
                      </div>

                      {message.content ? (
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">{message.content}</p>
                      ) : (
                        <p className="text-[15px] leading-7 text-muted-foreground">
                          本条消息未填写文字，模型已基于附件自动分析。
                        </p>
                      )}

                      {message.attachments && message.attachments.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {message.attachments.map((attachment) => {
                              const Icon = attachmentIcon(attachment.kind);
                              return (
                                <Badge key={attachment.id} variant="outline" className="gap-1.5 rounded-full px-3 py-1">
                                  <Icon className="size-3.5" />
                                  {attachmentLabel(attachment.kind)}: {attachment.name}
                                </Badge>
                              );
                            })}
                          </div>

                          {message.attachments.some((attachment) => attachment.kind === "image") ? (
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                              {message.attachments
                                .filter((attachment) => attachment.kind === "image")
                                .map((attachment) => (
                                  <div key={attachment.id} className="overflow-hidden rounded-2xl border bg-background/80">
                                    <img src={attachment.dataUrl} alt={attachment.name} className="h-28 w-full object-cover" />
                                    <div className="px-3 py-2 text-xs text-muted-foreground">{attachment.name}</div>
                                  </div>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {message.audioSrc ? (
                        <>
                          <Separator className="my-4" />
                          <div className="rounded-2xl bg-background/80 p-3">
                            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <Volume2 className="size-4 text-primary" />
                              音频回放
                            </div>
                            <audio controls autoPlay preload="auto" src={message.audioSrc} className="w-full">
                              你的浏览器不支持音频播放。
                            </audio>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ))
                )}

                {isActiveTabLoading ? (
                  <div className="mr-auto max-w-[92%] rounded-[28px] border border-primary/12 bg-background/80 p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <Badge variant="accent" className="gap-1.5 rounded-full px-3 py-1">
                        <Bot className="size-3.5" />
                        MiMo
                      </Badge>
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        {currentModelLabel}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {activeTab === "chat" ? "正在生成文字回复" : "正在生成语音回复"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      {loadingText}
                    </div>
                  </div>
                ) : null}

                <div ref={scrollAnchorRef} />
              </div>
            </ScrollArea>

            <Separator className="mt-6" />

            <div className="p-6">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {activeAttachments.length > 0 ? (
                  <div className="grid gap-3">
                    <div className="flex flex-wrap gap-2">
                      {activeAttachments.map((attachment) => {
                        const Icon = attachmentIcon(attachment.kind);
                        return (
                          <div
                            key={attachment.id}
                            className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-2 text-sm"
                          >
                            <Icon className="size-4 text-primary" />
                            <span className="max-w-48 truncate">{attachment.name}</span>
                            <span className="text-muted-foreground">{formatBytes(attachment.sizeBytes)}</span>
                            <button
                              type="button"
                              className="rounded-full p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                              onClick={() => handleRemoveAttachment(attachment.id)}
                              aria-label={`移除 ${attachment.name}`}
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {activeAttachments.some((attachment) => attachment.kind === "image") ? (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {activeAttachments
                          .filter((attachment) => attachment.kind === "image")
                          .map((attachment) => (
                            <div key={attachment.id} className="overflow-hidden rounded-2xl border bg-background/70">
                              <img src={attachment.dataUrl} alt={attachment.name} className="h-24 w-full object-cover" />
                              <div className="px-3 py-2 text-xs text-muted-foreground">{attachment.name}</div>
                            </div>
                          ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-3 rounded-[28px] border bg-background/85 p-3 shadow-sm">
                  <Textarea
                    id="message"
                    rows={4}
                    value={activeInput}
                    onKeyDown={handleComposerKeyDown}
                    onChange={(event) => {
                      if (activeTab === "chat") {
                        setChatInput(event.target.value);
                      } else {
                        setSpeakInput(event.target.value);
                      }
                    }}
                    placeholder={
                      activeTab === "chat"
                        ? "直接输入文字，或只上传图片 / 视频让 MiMo 自动分析。"
                        : "直接提问，或上传图片 / 视频 / 音频让 MiMo 先回答再朗读。"
                    }
                    className="min-h-[120px] resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
                  />

                  {activeTab === "speak" ? (
                    <>
                      <Input
                        id="custom-style"
                        type="text"
                        value={customStyle}
                        onChange={(event) => setCustomStyle(event.target.value)}
                        placeholder="自定义风格描述（可选）：例如 soft baby voice / 粤语，平静一点"
                        className="h-10 rounded-2xl border-border/70 bg-muted/40 px-4"
                      />

                      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                        <input
                          ref={speakFileInputRef}
                          type="file"
                          accept={activeAttachmentAccept}
                          multiple
                          className="hidden"
                          onChange={handleAttachmentChange}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="size-10 shrink-0 rounded-full"
                          onClick={() => activeFileInputRef.current?.click()}
                          aria-label="上传媒体附件"
                        >
                          <Plus className="size-4" />
                        </Button>

                        <Select value={selectedVoice} onValueChange={(value) => setSelectedVoice(value as VoiceOption)}>
                          <SelectTrigger id="voice" className="h-10 w-[180px] shrink-0 rounded-full bg-background px-4">
                            <SelectValue placeholder="语音" />
                          </SelectTrigger>
                          <SelectContent>
                            {VOICE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={presetStyle || NO_STYLE_VALUE}
                          onValueChange={(value) => setPresetStyle(value === NO_STYLE_VALUE ? "" : value)}
                        >
                          <SelectTrigger id="preset-style" className="h-10 w-[190px] shrink-0 rounded-full bg-background px-4">
                            <SelectValue placeholder="官方示例风格" />
                          </SelectTrigger>
                          <SelectContent>
                            {STYLE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          type="button"
                          variant="ghost"
                          className="shrink-0 rounded-full px-4 text-muted-foreground"
                          onClick={handleClearConversation}
                          disabled={isLoading}
                        >
                          <Trash2 className="size-4" />
                          清空会话
                        </Button>

                        <Button type="submit" disabled={!canSubmit} size="lg" className="ml-auto shrink-0 rounded-full px-6">
                          {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
                          {isLoading ? "MiMo 正在回复..." : "发送"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                      <input
                        ref={chatFileInputRef}
                        type="file"
                        accept={activeAttachmentAccept}
                        multiple
                        className="hidden"
                        onChange={handleAttachmentChange}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="size-10 shrink-0 rounded-full"
                        onClick={() => activeFileInputRef.current?.click()}
                        aria-label="上传图片或视频"
                      >
                        <Plus className="size-4" />
                      </Button>

                      <div className="rounded-full border border-border/70 bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
                        默认 tab 仅支持图片 / 视频输入
                      </div>

                      <Select value={selectedChatModel} onValueChange={(value) => setSelectedChatModel(value as ChatModelChoice)}>
                        <SelectTrigger id="chat-model" className="h-10 w-[190px] shrink-0 rounded-full bg-background px-4">
                          <SelectValue placeholder="默认聊天模型" />
                        </SelectTrigger>
                        <SelectContent>
                          {CHAT_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        variant="ghost"
                        className="shrink-0 rounded-full px-4 text-muted-foreground"
                        onClick={handleClearConversation}
                        disabled={isLoading}
                      >
                        <Trash2 className="size-4" />
                        清空会话
                      </Button>

                      <Button type="submit" disabled={!canSubmit} size="lg" className="ml-auto shrink-0 rounded-full px-6">
                        {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
                        {isLoading ? "MiMo 正在回复..." : "发送"}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>当前模型：</span>
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {currentModelLabel}
                  </Badge>
                  <span>
                    {activeTab === "chat"
                      ? selectedChatModel === "mimo-v2.5-pro" && effectiveChatModel !== selectedChatModel
                        ? "你当前选择了 MiMo-V2.5-Pro，但由于会话里包含图片或视频，实际会自动使用 MiMo-V2.5。"
                        : "当前 tab 只返回文字，支持图片和视频。"
                      : "当前 tab 会返回文字并生成语音，支持图片、音频、视频。"}
                  </span>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                {activeTab === "speak" ? (
                  <p className="text-sm leading-6 text-muted-foreground">
                    官方 style 为推荐示例，MiMo 也支持未列出的自然语言风格描述。{speakHelperText}
                  </p>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    默认 tab 现在支持手动选择 <code>MiMo-V2.5</code> 和 <code>MiMo-V2.5-Pro</code>，默认是{" "}
                    <code>MiMo-V2.5</code>；如果消息或历史里包含图片 / 视频，会自动使用 <code>MiMo-V2.5</code>。
                  </p>
                )}
              </form>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export default App;
