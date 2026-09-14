---
title: Audio für Podcasts normalisieren
locale: de
tool: audio-normalize
formats:
  - wav
  - mp3
updated: "2026-09-14"
description: Zwei-Pass loudnorm. Ziel −16, −14 oder −23 LUFS plus True-Peak.
---

`audio-normalize` misst im ersten FFmpeg-Durchlauf und wendet `loudnorm` linear im zweiten an. Ausgabe ist WAV plus Report (gemessene `input_i`, Ziel, True-Peak).

**Optionen.**

- `targetLufs`: `-16` (Default, typisch Podcast/Streaming), `-14`, `-23` (EBU R128, Broadcast).
- `truePeak` (Default `-1.5`, Bereich −9 bis 0).

**Presets.** `ebu-r128` setzt `-23`. `preset-audio-replaygain` bleibt bei `-16` (kein separates −18 im Enum).

Danach bei Bedarf `audio-convert` (`container` MP3/OPUS/…) oder `audio-limiter-dc`. Zwei-Pass braucht die ganze Datei im Speicher bzw. OPFS — sehr lange Folgen vorher schneiden (`audio-trim`: `startSec`, `endSec`).
