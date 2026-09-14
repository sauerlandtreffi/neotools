---
title: DOCX nach PDF
locale: de
tool: docx-to-pdf
formats:
  - docx
  - pdf
updated: "2026-09-14"
description: Word lokal nach PDF mit selektierbarem Text. Kein LibreOffice-WASM.
---

`docx-to-pdf` liest DOCX (OOXML) und setzt ein PDF mit eigenem Layout. Es gibt kein LibreOffice im Bundle. Komplexe Felder, SmartArt und manche Tabellen weichen vom Word-Original ab; Warnungen stehen im Report.

**Optionen** (`pdfOpts`).

- `page`: `a4` oder `letter`.
- `theme`: `default`, `github`, `academic`.
- `titlePage`, `toc`.
- `outputName` (sonst `{stem}.pdf`).

Für reinen Text: `docx-to-txt`. Für Weiterbearbeitung: `docx-to-markdown`. HTML-Weg: `docx-to-html` (`theme`).
