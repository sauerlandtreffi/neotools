---
title: Normalize audio for a podcast
locale: en
tool: audio-normalize
formats:
  - wav
  - mp3
updated: "2026-09-14"
description: Two-pass loudnorm. Target −16, −14 or −23 LUFS plus true peak.
---

`audio-normalize` measures in the first FFmpeg pass and applies linear `loudnorm` in the second. Output is WAV plus a report (measured `input_i`, target, true peak).

**Options.**

- `targetLufs`: `-16` (default, typical podcast/streaming), `-14`, `-23` (EBU R128, broadcast).
- `truePeak` (default `-1.5`, range −9 to 0).

**Presets.** `ebu-r128` sets `-23`. `preset-audio-replaygain` stays at `-16` (no separate −18 in the enum).

Then `audio-convert` if needed (`container` MP3/OPUS/…) or `audio-limiter-dc`. Two-pass needs the whole file in memory or OPFS — trim long episodes first (`audio-trim`: `startSec`, `endSec`).
