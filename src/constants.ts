export const NO_STYLE_VALUE = "__none__";

export const VOICE_OPTIONS = [
  { label: "MiMo 中文女声", value: "default_zh" },
  { label: "MiMo 默认声线", value: "mimo_default" },
  { label: "MiMo English Voice", value: "default_en" }
] as const;

export const STYLE_OPTIONS = [
  { label: "无风格", value: NO_STYLE_VALUE },
  { label: "Happy", value: "Happy" },
  { label: "Sad", value: "Sad" },
  { label: "Angry", value: "Angry" },
  { label: "Speed up", value: "Speed up" },
  { label: "Slow down", value: "Slow down" },
  { label: "Whisper", value: "Whisper" },
  { label: "Clamped voice", value: "Clamped voice" },
  { label: "Taiwanese accent", value: "Taiwanese accent" },
  { label: "Northeastern dialect", value: "Northeastern dialect" },
  { label: "Sichuan dialect", value: "Sichuan dialect" },
  { label: "Henan dialect", value: "Henan dialect" },
  { label: "Cantonese", value: "Cantonese" },
  { label: "Sun Wukong", value: "Sun Wukong" },
  { label: "Lin Daiyu", value: "Lin Daiyu" },
  { label: "唱歌", value: "唱歌" }
] as const;

export const CHAT_ATTACHMENT_ACCEPT = "image/*,video/*";
export const ATTACHMENT_ACCEPT = "image/*,audio/*,video/*";
export const MAX_BASE64_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_LOCAL_UPLOAD_BYTES = Math.floor((MAX_BASE64_MEDIA_BYTES * 3) / 4);

export type VoiceOption = (typeof VOICE_OPTIONS)[number]["value"];
