---
title: Bind a case file with Bates and a TOC
locale: en
tool: pdf-aktenbundler
formats:
  - pdf
  - jpg
  - png
updated: "2026-09-14"
description: Bind PDFs and images into one file — cover, TOC, bookmarks, Bates numbers.
---

`pdf-aktenbundler` joins PDFs and JPEG/PNG into one file. Order is selection order.

**Options.**

- `title` (default `Akte`), `aktenzeichen`, `parteien`, `datum`.
- `cover`, `toc` (both default `true`), `separators`, `inheritOutlines`.
- `batesPrefix`, `batesStart` (default `1`), `batesDigits` (default `4`).
- `batesPosition`: `footer-right`, `footer-center`, `footer-left`.
- `headerAktenzeichen`, `anlagenPrefix` (preset `anlagen` sets `Anlage K`).
- `outputName` (default `akte.pdf`).

**Presets.** `akte` (TOC + cover), `anlagen` (plus exhibit stamps).

**Afterward.** [Sanitize](/en/guides/sanitize) before sending. Merge and binder copy metadata and attachments along.
