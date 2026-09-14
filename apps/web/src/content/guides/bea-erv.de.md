---
title: beA-Konformität prüfen
locale: de
tool: dach-bea-erv
formats:
  - pdf
updated: "2026-09-14"
description: PDFs gegen das ERV-Regelwerk prüfen, optional Auto-Fix. Kein Ersatz für die EGVP-Doku.
---

`dach-bea-erv` prüft PDFs lokal gegen ein versioniertes Regelwerk (Dateiname, Größe, JavaScript, Formulare, PDF/A, Textlayer). Quellen im Report: ERVV §2/§5, ERVB.

**Optionen.**

- `autoFix` (`false`): nur prüfen. Preset `check`.
- `autoFix` (`true`): Preset `autofix` — die Engine fährt die hinterlegte Auto-Fix-Pipeline (Sanitize und verwandte PDF-Schritte), soweit die Tools geladen sind.
- `locale`: `de` oder `en` für den Markdown-Report.

**Ausgabe.** `erv-report.json`, `erv-report.md`, Ampel im Report. Grün in diesem Tool heißt nicht automatisch „gerichtsfest“. Es gilt die aktuelle Doku der empfangenden Stelle.

**Danach.** PDF/A extra mit [`pdf-a`](/guides/pdfa) (`mode`, `profile` `2b`/`3b`). Aktive Inhalte vorher mit [`pdf-sanitize`](/guides/sanitize) entfernen.
