---
title: DOCX to PDF
locale: en
tool: docx-to-pdf
formats:
  - docx
  - pdf
updated: "2026-09-14"
description: Word to PDF locally with selectable text. No LibreOffice WASM.
---

`docx-to-pdf` reads DOCX (OOXML) and writes a PDF with its own layout. There is no LibreOffice in the bundle. Complex fields, SmartArt and some tables diverge from Word; warnings land in the report.

**Options** (`pdfOpts`).

- `page`: `a4` or `letter`.
- `theme`: `default`, `github`, `academic`.
- `titlePage`, `toc`.
- `outputName` (otherwise `{stem}.pdf`).

Plain text: `docx-to-txt`. Further editing: `docx-to-markdown`. HTML path: `docx-to-html` (`theme`).
