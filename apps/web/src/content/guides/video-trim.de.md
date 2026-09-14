---
title: Video trimmen, lokal
locale: de
tool: video-trim
formats:
  - mp4
  - webm
updated: "2026-09-14"
description: In/Out in Sekunden, Stream-Copy wenn Keyframes es erlauben.
---

`video-trim` schneidet mit `startSec` und `endSec` (0 = Dateiende). `copy=true` versucht `-c copy` (kein Re-Encode). Sitzt der Schnitt zwischen Keyframes, fällt FFmpeg auf Re-Encode (VP9/MPEG-4, kein libx264) zurück.

Der Editor `media-trim` zeigt In/Out. Große Dateien: Warnung über OPFS/RAM (`largeFileWarnings`).

**Danach.** Mehrere Clips: `video-join`. Stille: `video-cutlist` aus `transcript-edits`. Zielgröße: `video-compress` Preset `fit` (`targetSizeMb`).
