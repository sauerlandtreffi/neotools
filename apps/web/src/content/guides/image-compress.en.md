---
title: Compress images without a visible sharpness drop
locale: en
tool: image-compress
formats:
  - jpg
  - png
  - webp
updated: "2026-09-14"
description: Presets, target size or SSIM. Keep the original if the result is not smaller.
---

`image-compress` re-encodes locally. If the result is not smaller, the original stays.

**Options.**

- `preset`: `light` (quality 88), `medium` (75), `heavy` (55), `visuell-lossless`, `target`.
- `visuell-lossless` uses `ssimThreshold` (default `0.97`).
- `target` or `targetSizeKb` > 0: binary-search quality, then scale.
- `format`: `same`, `jpeg`, `webp`, `avif`, `png`, `jxl`.

**Preset ids.** `light`, `medium`, `heavy`, `visuell-lossless`.

Bit-identical lossless is only an unchanged bitstream. “No visible loss” here means SSIM above the threshold — a metric, not a warranty.
