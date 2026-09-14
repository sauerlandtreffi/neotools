---
title: Video für WhatsApp komprimieren
locale: de
tool: video-compress
formats:
  - mp4
  - webm
updated: "2026-09-14"
description: Zielgröße mit preset fit und targetSizeMb. WhatsApp komprimiert danach oft noch einmal.
---

WhatsApp nimmt Chat-Video typischerweise als MP4/H.264 und kürzt oder kodiert serverseitig nach. Lokale Vorbereitung verringert Überraschungen. Limits: [/spec/whatsapp](/spec/whatsapp).

**`video-compress`.**

- `preset`: `web` (VP9/WebM, `crf` Default 32), `social`, `archive`, `fit`.
- `fit` plus `targetSizeMb`: Binärsuche Bitrate und Auflösung. Preset `fit-8mb` setzt `targetSizeMb: 8`.
- Ausgabe dieses Tools ist WebM (VP9 + Opus). Für ein MP4 mit H.264 `video-convert` nutzen: `container: mp4`, `codec: h264` (Browser: WebCodecs, sonst klare Absage).

**Praxis.** Clip unter etwa 16 MB halten, Status ~30 s. Nach dem Senden sieht das Gegenüber oft trotzdem die WhatsApp-Kodierung, nicht die lokale Datei.
