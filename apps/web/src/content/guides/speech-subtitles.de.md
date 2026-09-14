---
title: Untertitel erzeugen
locale: de
tool: speech-transcribe
formats:
  - srt
  - vtt
updated: "2026-09-14"
description: Whisper lokal. SRT und VTT mit Wortzeiten. Modell erst nach Bestätigung vom eigenen Origin.
---

`speech-transcribe` transkribiert Audio oder den Ton aus einem Video auf dem Gerät.

**Optionen.**

- `model`: `whisper-tiny` (Default), `whisper-base`, `whisper-small`, `distil-whisper-small-en`, `whisper-large-v3-turbo`.
- `language` (Default `auto`), `task`: `transcribe` oder `translate`.
- `wordTimestamps` (Default `true`), `diarize` (lite, Default `false`).
- `formats`: Kommaliste, Default `srt,vtt,txt,json`. Preset `subs` setzt `srt,vtt`.
- `bilingual` plus `bilingualPair` (`de-en`, `en-de`, …).
- `maxLineLength` (Default `42`), `maxLines` (Default `2`).
- `confirmModelDownload`: ohne `true` startet kein Modell-Download.

Preset `tiny` bleibt klein. Längere Dateien brauchen mehr RAM. Einbrennen in ein Video ist ein anderes Tool: `video-subtitles-burn` (`srtText`).
