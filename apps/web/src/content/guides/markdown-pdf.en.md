---
title: Markdown to PDF
locale: en
tool: markdown-to-pdf
formats:
  - md
  - pdf
updated: "2026-09-14"
description: Typeset Markdown locally. Themes, title page, TOC, code. Optional source in the form.
---

`markdown-to-pdf` typesets GFM locally. Use a file or the `source` field when no file is present.

**Options.**

- `page`: `a4` / `letter`.
- `theme`: `default`, `github`, `academic`.
- `titlePage`, `toc`.
- `title`, `source`, `outputName`.

**Presets.** `default`, `github`, `academic` (`titlePage` and `toc` on).

Code blocks are included. HTML instead of PDF: `markdown-to-html` (`theme`, `source`). Word: `markdown-to-docx`.
