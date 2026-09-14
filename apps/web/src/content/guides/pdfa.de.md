---
title: PDF/A für Behörden — ohne Ghostscript
locale: de
tool: pdf-a
formats:
  - pdf
  - pdfa
updated: "2026-09-14"
description: Was PDF/A von normalem PDF unterscheidet und warum Validierung ehrlich sein muss.
---

Behörden und Archive verlangen oft **PDF/A**, nicht „irgendein PDF“. PDF/A ist ein *Profil*: eingebettete Schriften, XMP, keine Verschlüsselung, kein JavaScript, definierte Farbbehandlung.

**Was NeoTools nicht tut.** Es gibt hier kein Ghostscript und kein MuPDF (AGPL). `pdf-a` konvertiert best-effort mit pdf-lib und sagt bei Lücken **nicht** „gültig“, sondern listet Verletzungen.

**Praktisch.**

1. Quellen ohne fehlende Fonts wählen oder Schriften vorher einbetten.
2. JavaScript, Attachments und OpenActions entfernen ([Sanitize](/guides/sanitize)).
3. Validieren. Ein grünes Häkchen ohne Report ist wertlos.

**beA/ERV.** PDF/A allein ist nicht automatisch gerichtsfest. Größe, Version und aktive Inhalte prüft [dach-bea-erv](/spec/bea-erv) getrennt. Die aktuelle EGVP-Doku der Stelle gilt, nicht dieser Text.
