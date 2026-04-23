export const NO_STYLE_VALUE = "__none__";

export const VOICE_OPTIONS = [
  { label: "MiMo 默认声线", value: "mimo_default" },
  { label: "冰糖（中文女声）", value: "冰糖" },
  { label: "茉莉（中文女声）", value: "茉莉" },
  { label: "苏打（中文男声）", value: "苏打" },
  { label: "白桦（中文男声）", value: "白桦" },
  { label: "Mia（English Female）", value: "Mia" },
  { label: "Chloe（English Female）", value: "Chloe" },
  { label: "Milo（English Male）", value: "Milo" },
  { label: "Dean（English Male）", value: "Dean" }
] as const;

export const STYLE_OPTIONS = [
  { label: "无风格", value: NO_STYLE_VALUE },
  { label: "开心", value: "Happy" },
  { label: "悲伤", value: "Sad" },
  { label: "生气", value: "Angry" },
  { label: "语速加快", value: "Speed up" },
  { label: "语速放慢", value: "Slow down" },
  { label: "耳语", value: "Whisper" },
  { label: "夹子音", value: "Clamp voice" },
  { label: "台湾口音", value: "Taiwanese accent" },
  { label: "东北话", value: "Northeast dialect" },
  { label: "四川话", value: "Sichuan dialect" },
  { label: "河南话", value: "Henan dialect" },
  { label: "粤语", value: "Cantonese" },
  { label: "孙悟空", value: "Sun Wukong" },
  { label: "林黛玉", value: "Lin Daiyu" },
  { label: "唱歌", value: "唱歌" }
] as const;

export const CHAT_ATTACHMENT_ACCEPT = "image/*,video/*";
export const ATTACHMENT_ACCEPT = "image/*,audio/*,video/*";
export const MAX_BASE64_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_LOCAL_UPLOAD_BYTES = Math.floor((MAX_BASE64_MEDIA_BYTES * 3) / 4);

export type VoiceOption = (typeof VOICE_OPTIONS)[number]["value"];
