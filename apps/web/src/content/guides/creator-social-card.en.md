---
title: Social cards and OG images locally
locale: en
tool: creator-social-card
formats:
  - png
  - jpeg
updated: "2026-09-14"
description: OG and social cards with template, title and subtitle — no upload.
---

`creator-social-card` renders a card on-device. Options: `template` (`og` 1200×630, `twitter` 1600×900, `square` 1080×1080), `title`, `subtitle`, `background` (hex).

An image is used as cover (`coverFit`). A file with `logo` in the name sits top-left. Text uses the bundled OFL font (`applyTextWatermark`).

**Next.** For favicon and app-icon sets use `creator-export-pack` with preset `favicon` or `og`. `creator-spec-check` reads sizes from the format knowledge base.
