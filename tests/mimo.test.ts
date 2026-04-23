import { describe, expect, it } from "vitest";
import {
  buildTtsContent,
  buildUserContent,
  getEffectiveUserPrompt,
  resolveAppliedStyle,
  selectTextModel
} from "../server/mimo";

const imageAttachment = {
  kind: "image" as const,
  name: "cat.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,ZmFrZQ=="
};

describe("resolveAppliedStyle", () => {
  it("prefers custom style over preset style", () => {
    expect(resolveAppliedStyle("Happy", "soft baby voice")).toBe("soft baby voice");
  });

  it("falls back to preset style when custom style is empty", () => {
    expect(resolveAppliedStyle("Whisper", "   ")).toBe("Whisper");
  });

  it("returns null when neither style is provided", () => {
    expect(resolveAppliedStyle("", "   ")).toBeNull();
  });
});

describe("buildTtsContent", () => {
  it("adds a style tag for singing mode", () => {
    expect(buildTtsContent("月亮代表我的心", "唱歌")).toBe("<style>唱歌</style>月亮代表我的心");
  });

  it("does not add a style tag when style is missing", () => {
    expect(buildTtsContent("Hello there", null)).toBe("Hello there");
  });
});

describe("multimodal helpers", () => {
  it("uses omni when attachments are present", () => {
    expect(selectTextModel([], [imageAttachment])).toBe("mimo-v2-omni");
  });

  it("keeps pro when there is no media in the conversation", () => {
    expect(selectTextModel([], [])).toBe("mimo-v2-pro");
  });

  it("uses the selected MiMo-V2.5-Pro model when the chat is text-only", () => {
    expect(selectTextModel([], [], "mimo-v2.5-pro")).toBe("mimo-v2.5-pro");
  });

  it("falls back to MiMo-V2.5 when MiMo-V2.5-Pro is selected but media is present", () => {
    expect(selectTextModel([], [imageAttachment], "mimo-v2.5-pro")).toBe("mimo-v2.5");
  });

  it("builds image content parts and appends the user prompt", () => {
    expect(buildUserContent("请描述这张图", [imageAttachment])).toEqual([
      {
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,ZmFrZQ=="
        }
      },
      {
        type: "text",
        text: "请描述这张图"
      }
    ]);
  });

  it("provides a default prompt for attachment-only messages", () => {
    expect(getEffectiveUserPrompt("", [imageAttachment])).toBe("请分析我上传的内容，并提炼其中最重要的信息。");
  });
});
