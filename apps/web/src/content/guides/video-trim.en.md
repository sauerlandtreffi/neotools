---
title: Trim video locally
locale: en
tool: video-trim
formats:
  - mp4
  - webm
updated: "2026-09-14"
description: In/out in seconds, stream-copy when keyframes allow.
---

`video-trim` cuts with `startSec` and `endSec` (0 = end of file). `copy=true` tries `-c copy` (no re-encode). If the cut sits between keyframes, FFmpeg falls back to a re-encode (VP9/MPEG-4, no libx264).

The `media-trim` editor shows in/out. Large files: OPFS/RAM warning (`largeFileWarnings`).

**Next.** Several clips: `video-join`. Silence: `video-cutlist` from `transcript-edits`. Target size: `video-compress` preset `fit` (`targetSizeMb`).
