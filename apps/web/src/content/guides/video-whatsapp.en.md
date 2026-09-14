---
title: Compress video for WhatsApp
locale: en
tool: video-compress
formats:
  - mp4
  - webm
updated: "2026-09-14"
description: Target size with preset fit and targetSizeMb. WhatsApp often recompresses afterward.
---

WhatsApp typically takes chat video as MP4/H.264 and then trims or re-encodes on the server. Preparing locally reduces surprises. Limits: [/en/spec/whatsapp](/en/spec/whatsapp).

**`video-compress`.**

- `preset`: `web` (VP9/WebM, `crf` default 32), `social`, `archive`, `fit`.
- `fit` plus `targetSizeMb`: binary-search bitrate and resolution. Preset `fit-8mb` sets `targetSizeMb: 8`.
- This tool writes WebM (VP9 + Opus). For MP4/H.264 use `video-convert`: `container: mp4`, `codec: h264` (browser: WebCodecs, otherwise a clear refusal).

**In practice.** Keep the clip under about 16 MB; status ~30 s. After sending, the other side often still sees WhatsApp’s encode, not the local file.
