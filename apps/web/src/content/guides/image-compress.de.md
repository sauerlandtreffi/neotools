---
title: Bilder komprimieren ohne sichtbaren Schärfeverlust
locale: de
tool: image-compress
formats:
  - jpg
  - png
  - webp
updated: "2026-09-14"
description: Presets, Zielgröße oder SSIM. Nur übernehmen, wenn die Datei kleiner wird.
---

`image-compress` kodiert lokal neu. Ist das Ergebnis nicht kleiner, bleibt das Original.

**Optionen.**

- `preset`: `light` (Qualität 88), `medium` (75), `heavy` (55), `visuell-lossless`, `target`.
- `visuell-lossless` nutzt `ssimThreshold` (Default `0.97`).
- `target` bzw. `targetSizeKb` > 0: Binärsuche der Qualität, danach Skalierung.
- `format`: `same`, `jpeg`, `webp`, `avif`, `png`, `jxl`.

**Preset-IDs.** `light`, `medium`, `heavy`, `visuell-lossless`.

Verlustfrei im strengen Sinn ist nur ein identischer Bitstrom. „Ohne sichtbaren Verlust“ heißt hier SSIM über der Schwelle — das ist eine Metrik, kein Garantieversprechen.
