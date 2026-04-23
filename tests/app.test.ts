import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("/api/desktop-config", () => {
  it("reports disabled desktop configuration for the web server path", async () => {
    const app = createApp({ apiKey: "test-key" });
    const response = await request(app).get("/api/desktop-config");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: false,
      hasApiKey: true
    });
  });

  it("saves the desktop API key without echoing it back", async () => {
    let savedApiKey = "";
    const app = createApp({
      apiKey: "",
      desktopConfig: {
        hasApiKey: () => Boolean(savedApiKey),
        saveApiKey: (apiKey) => {
          savedApiKey = apiKey;
        },
        restartApp: vi.fn()
      }
    });

    const beforeResponse = await request(app).get("/api/desktop-config");
    expect(beforeResponse.body).toEqual({
      enabled: true,
      hasApiKey: false
    });

    const saveResponse = await request(app).post("/api/desktop-config/api-key").send({
      apiKey: "  test-desktop-key  "
    });

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body).toEqual({
      ok: true,
      hasApiKey: true,
      restartRequired: true
    });
    expect(saveResponse.text).not.toContain("test-desktop-key");
    expect(savedApiKey).toBe("test-desktop-key");
  });

  it("triggers desktop restart after the response is sent", async () => {
    const restartApp = vi.fn();
    const app = createApp({
      apiKey: "",
      desktopConfig: {
        hasApiKey: () => true,
        saveApiKey: vi.fn(),
        restartApp
      }
    });

    const response = await request(app).post("/api/desktop-config/restart").send();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(restartApp).toHaveBeenCalledTimes(1);
  });
});

describe("/api/chat", () => {
  it("honors the selected MiMo-V2.5-Pro model for text-only chat", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        choices: [
          {
            message: {
              content: "可以，当前会按你选的 MiMo-V2.5-Pro 处理。"
            }
          }
        ]
      })
    );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat").send({
      message: "只用文本聊天",
      textModel: "mimo-v2.5-pro",
      history: []
    });

    expect(response.status).toBe(200);
    expect(response.body.modelUsed).toBe("mimo-v2.5-pro");
    const firstRequest = fetchFn.mock.calls[0];
    expect(firstRequest?.[1]?.body).toContain("\"model\":\"mimo-v2.5-pro\"");
  });

  it("returns reply text and model without triggering TTS", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        choices: [
          {
            message: {
              content: "可以，我们先从一个支持图片输入的默认聊天页开始。"
            }
          }
        ]
      })
    );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat").send({
      message: "帮我做一个默认文本聊天 tab",
      history: []
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      replyText: "可以，我们先从一个支持图片输入的默认聊天页开始。",
      modelUsed: "mimo-v2-pro"
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("uses omni for image requests on the text-only route", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        choices: [
          {
            message: {
              content: "画面里是一只坐在窗边的小狗。"
            }
          }
        ]
      })
    );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat").send({
      message: "请描述这张图",
      attachments: [
        {
          kind: "image",
          name: "dog.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,ZmFrZQ=="
        }
      ],
      history: []
    });

    expect(response.status).toBe(200);
    expect(response.body.modelUsed).toBe("mimo-v2-omni");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("falls back to MiMo-V2.5 when MiMo-V2.5-Pro is selected for media input", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        choices: [
          {
            message: {
              content: "我会使用 MiMo-V2.5 来理解图片内容。"
            }
          }
        ]
      })
    );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat").send({
      message: "请分析这张图",
      textModel: "mimo-v2.5-pro",
      attachments: [
        {
          kind: "image",
          name: "dog.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,ZmFrZQ=="
        }
      ],
      history: []
    });

    expect(response.status).toBe(200);
    expect(response.body.modelUsed).toBe("mimo-v2.5");
    const firstRequest = fetchFn.mock.calls[0];
    expect(firstRequest?.[1]?.body).toContain("\"model\":\"mimo-v2.5\"");
  });
});

describe("/api/chat-speak", () => {
  it("can skip TTS and return text-only output for the default tab", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        choices: [
          {
            message: {
              content: "可以，我们先从默认聊天模式开始。"
            }
          }
        ]
      })
    );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat-speak").send({
      message: "默认 tab 只返回文字",
      history: [],
      textModel: "mimo-v2.5",
      skipTts: true
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      replyText: "可以，我们先从默认聊天模式开始。",
      modelUsed: "mimo-v2.5"
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns reply text, audio, applied style, and the selected text model", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          choices: [
            {
              message: {
                content: "当然可以，我们可以先做一个会说话的问答页面。"
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          choices: [
            {
              message: {
                audio: {
                  data: "dGVzdC1hdWRpby1iYXNlNjQ="
                }
              }
            }
          ]
        })
      );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat-speak").send({
      message: "帮我设计一个语音网页",
      history: [],
      voice: "冰糖",
      presetStyle: "Happy",
      customStyle: "soft and warm"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      replyText: "当然可以，我们可以先做一个会说话的问答页面。",
      audioBase64: "dGVzdC1hdWRpby1iYXNlNjQ=",
      audioMimeType: "audio/wav",
      appliedStyle: "soft and warm",
      modelUsed: "mimo-v2-pro"
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const firstRequest = fetchFn.mock.calls[0];
    expect(firstRequest?.[1]?.body).toContain("voice chat mode");
    expect(firstRequest?.[1]?.body).toContain("Never say that you cannot speak");
    const secondRequest = fetchFn.mock.calls[1];
    expect(secondRequest?.[1]?.body).toContain("\"model\":\"mimo-v2.5-tts\"");
    expect(secondRequest?.[1]?.body).toContain("\"voice\":\"冰糖\"");
  });

  it("maps the old default_zh voice to the MiMo-V2.5-TTS Bingtang voice", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          choices: [
            {
              message: {
                content: "可以，我会用新版音色朗读。"
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          choices: [
            {
              message: {
                audio: {
                  data: "YmluZ3Rhbmc="
                }
              }
            }
          ]
        })
      );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat-speak").send({
      message: "用旧音色 ID 试一下",
      history: [],
      voice: "default_zh"
    });

    expect(response.status).toBe(200);
    const secondRequest = fetchFn.mock.calls[1];
    expect(secondRequest?.[1]?.body).toContain("\"voice\":\"冰糖\"");
  });

  it("switches to omni when media attachments are present", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          choices: [
            {
              message: {
                content: "这张图里有一只在阳光下的小猫。"
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          choices: [
            {
              message: {
                audio: {
                  data: "b21uaS1hdWRpbw=="
                }
              }
            }
          ]
        })
      );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat-speak").send({
      message: "请描述这张图",
      attachments: [
        {
          kind: "image",
          name: "cat.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,ZmFrZQ=="
        }
      ],
      history: [],
      voice: "冰糖"
    });

    expect(response.status).toBe(200);
    expect(response.body.modelUsed).toBe("mimo-v2-omni");
    const firstRequest = fetchFn.mock.calls[0];
    expect(firstRequest?.[1]?.body).toContain("\"model\":\"mimo-v2-omni\"");
    expect(firstRequest?.[1]?.body).toContain("\"type\":\"image_url\"");
  });

  it("allows attachment-only requests by providing a default prompt", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          choices: [
            {
              message: {
                content: "这段音频听起来像是在询问天气。"
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          choices: [
            {
              message: {
                audio: {
                  data: "YXVkaW8="
                }
              }
            }
          ]
        })
      );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat-speak").send({
      attachments: [
        {
          kind: "audio",
          name: "voice.wav",
          mimeType: "audio/wav",
          dataUrl: "data:audio/wav;base64,ZmFrZQ=="
        }
      ],
      history: []
    });

    expect(response.status).toBe(200);
    expect(response.body.modelUsed).toBe("mimo-v2-omni");
  });

  it("returns a stable error when the Xiaomi API fails", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            message: "Upstream failure"
          }
        },
        429
      )
    );

    const app = createApp({ apiKey: "test-key", fetchFn });
    const response = await request(app).post("/api/chat-speak").send({
      message: "你好",
      history: []
    });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      error: {
        code: "MIMO_API_ERROR",
        message: "Upstream failure"
      }
    });
  });

  it("returns a config error when the API key is missing", async () => {
    const app = createApp({ apiKey: "" });
    const response = await request(app).post("/api/chat-speak").send({
      message: "你好",
      history: []
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "CONFIG_ERROR",
        message: "Missing MIMO_API_KEY in the local server."
      }
    });
  });
});
