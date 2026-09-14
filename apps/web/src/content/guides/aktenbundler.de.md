---
title: Akte mit Bates und Inhaltsverzeichnis binden
locale: de
tool: pdf-aktenbundler
formats:
  - pdf
  - jpg
  - png
updated: "2026-09-14"
description: Mehrere PDFs und Bilder zu einer Akte — Deckblatt, TOC, Lesezeichen, Bates.
---

`pdf-aktenbundler` fügt PDFs und JPEG/PNG zu einer Datei. Reihenfolge ist die Auswahlreihenfolge.

**Optionen.**

- `title` (Default `Akte`), `aktenzeichen`, `parteien`, `datum`.
- `cover`, `toc` (beide Default `true`), `separators`, `inheritOutlines`.
- `batesPrefix`, `batesStart` (Default `1`), `batesDigits` (Default `4`).
- `batesPosition`: `footer-right`, `footer-center`, `footer-left`.
- `headerAktenzeichen`, `anlagenPrefix` (Preset `anlagen` setzt `Anlage K`).
- `outputName` (Default `akte.pdf`).

**Presets.** `akte` (TOC + Cover), `anlagen` (plus Anlagen-Stempel).

**Danach.** Vor dem Versand [sanitizen](/guides/sanitize). Merge und Bundler kopieren Metadaten und Anhänge mit.
