---
title: Generate subtitles
locale: en
tool: speech-transcribe
formats:
  - srt
  - vtt
updated: "2026-09-14"
description: Whisper locally. SRT and VTT with word timings. Model from the same origin after confirmation.
---

`speech-transcribe` transcribes audio or the sound track of a video on the device.

**Options.**

- `model`: `whisper-tiny` (default), `whisper-base`, `whisper-small`, `distil-whisper-small-en`, `whisper-large-v3-turbo`.
- `language` (default `auto`), `task`: `transcribe` or `translate`.
- `wordTimestamps` (default `true`), `diarize` (lite, default `false`).
- `formats`: comma list, default `srt,vtt,txt,json`. Preset `subs` sets `srt,vtt`.
- `bilingual` plus `bilingualPair` (`de-en`, `en-de`, …).
- `maxLineLength` (default `42`), `maxLines` (default `2`).
- `confirmModelDownload`: without `true` no model download starts.

Preset `tiny` stays small. Longer files need more RAM. Burning into a video is a different tool: `video-subtitles-burn` (`srtText`).
