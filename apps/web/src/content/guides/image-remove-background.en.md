---
title: Remove a background
locale: en
tool: image-remove-background
formats:
  - png
  - webp
  - jpg
updated: "2026-09-14"
description: Local cut-out with U²-Net or IS-Net. Model from the same origin, after confirmation.
---

`image-remove-background` segments on the device (ONNX). It is a helper, not a studio promise.

**Options.**

- `model`: `u2netp` (default) or `isnet-general-q8`.
- `threshold` (default `0.45`), `feather` (default `2`).
- `background`: `transparent`, `color` (hex `color`, default `#ffffff`), `image` (second file, name contains `bg` or `hintergrund`).
- `format`: `png` or `webp`, `quality` 0.1–1 (default `0.92`).
- `confirmModelDownload`: must be `true` before the model loads from the same origin.

**Presets.** `cutout` (transparent, PNG), `white` (color `#ffffff`).

Hair and glass edges often stay messy. Raise `feather` or finish by hand.
