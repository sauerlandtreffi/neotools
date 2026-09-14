---
title: Markdown nach PDF
locale: de
tool: markdown-to-pdf
formats:
  - md
  - pdf
updated: "2026-09-14"
description: Markdown lokal setzen. Themes, Titelseite, TOC, Code. Optional Quelltext im Formular.
---

`markdown-to-pdf` setzt GFM lokal. Datei oder Feld `source`, wenn keine Datei liegt.

**Optionen.**

- `page`: `a4` / `letter`.
- `theme`: `default`, `github`, `academic`.
- `titlePage`, `toc`.
- `title`, `source`, `outputName`.

**Presets.** `default`, `github`, `academic` (`titlePage` und `toc` an).

Code-Blöcke werden mitgesetzt. Für HTML statt PDF: `markdown-to-html` (`theme`, `source`). Für Word: `markdown-to-docx`.
