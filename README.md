# Mimo Chat Lab

A local web playground for Xiaomi MiMo text, multimodal, and voice chat workflows, built to evolve with new MiMo model releases.

## Why This Project

Xiaomi MiMo is quickly becoming a serious model family for agent workflows, multimodal understanding, and speech generation. With the MiMo V2.5 update, the platform now spans:

- `MiMo-V2.5` for native full-modal understanding
- `MiMo-V2.5-Pro` for stronger text-first reasoning and agent tasks
- `MiMo-V2.5-TTS` for high-quality speech synthesis

This project turns those capabilities into a clean local app you can actually use, test, and extend.

## What You Get

- `Default Chat` tab for text, image, and video conversations
- Manual model switcher for `MiMo-V2.5` and `MiMo-V2.5-Pro`
- Safe auto-fallback to `MiMo-V2.5` when media is present, so multimodal requests do not break
- `Voice Chat` tab that replies with text and immediately generates playable audio
- MiMo-powered speech synthesis via `mimo-v2.5-tts`
- Separate chat histories for text chat and voice chat
- Local developer setup with React + Vite on the frontend and Express on the backend

## Product Behavior

### Default Chat

- Text-only messages can use either `MiMo-V2.5` or `MiMo-V2.5-Pro`
- Images and videos are supported
- If `MiMo-V2.5-Pro` is selected but the message history includes media, the app automatically routes the request to `MiMo-V2.5`
- Output is text-only

### Voice Chat

- Supports text, image, audio, and video inputs
- Generates a text reply first
- Synthesizes speech with `mimo-v2.5-tts`
- Plays the returned audio directly in the browser

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Radix UI
- Backend: Express, TypeScript
- API style: OpenAI-compatible chat completions against Xiaomi MiMo

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Create your env file:

```bash
cp .env.example .env
```

3. Set your MiMo API key in `.env`:

```bash
MIMO_API_KEY=your_key_here
```

4. Start the app:

```bash
pnpm dev
```

5. Open:

```text
http://localhost:5173
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `MIMO_API_KEY` | Yes | API key for Xiaomi MiMo |
| `PORT` | No | Local backend port, defaults to `3001` |

## Available Scripts

- `pnpm dev` starts frontend and backend together
- `pnpm test` runs unit and API tests
- `pnpm build` builds the client and compiles the server
- `pnpm start` runs the compiled server

## Local Architecture

```text
Browser UI (React/Vite)
  -> /api/*
Express local server
  -> Xiaomi MiMo API
```

The local server is responsible for:

- validating media attachments
- routing chat requests to the right MiMo model
- applying voice style options
- converting MiMo TTS responses into playable browser audio

## Notes on MiMo Routing

Current model routing in this project:

| Scenario | Model |
| --- | --- |
| Default Chat, text-only | `mimo-v2.5` or `mimo-v2.5-pro` |
| Default Chat, with image/video | `mimo-v2.5` |
| Voice Chat, text-only reply generation | `mimo-v2-pro` |
| Voice Chat, multimodal reply generation | `mimo-v2-omni` |
| Voice synthesis | `mimo-v2.5-tts` |

This split keeps the app practical today while staying flexible for future MiMo upgrades such as V3, V3.5, and V4.

## Official MiMo References

- [MiMo V2.5 launch news](https://platform.xiaomimimo.com/docs/news/v2.5-news)
- [MiMo V2.5 TTS documentation](https://platform.xiaomimimo.com/docs/usage-guide/speech-synthesis-v2.5)
- [MiMo model updates](https://platform.xiaomimimo.com/docs/updates/model)

## Roadmap Ideas

- Move the Voice Chat text-generation path fully onto MiMo V2.5 models
- Add TTS model switching for built-in voices, voice design, and voice cloning
- Add conversation export and prompt presets
- Add deployment-ready environment setup for hosted demos
