---
title: Sanitize vor dem Versand
locale: de
tool: pdf-sanitize
formats:
  - pdf
updated: "2026-09-14"
description: JavaScript, Anhänge, Metadaten und versteckte Layer vor der Weitergabe entfernen.
---

Ein PDF, das „nur zum Lesen“ gedacht ist, kann trotzdem JavaScript, eingebettete Dateien, Autorenfelder, Thumbnails und optionale Inhaltsschichten tragen. `pdf-sanitize` räumt das lokal auf.

**Mindestens entfernen vor externer Mail.**

- OpenAction / JavaScript
- FileAttachments und eingebettete Dateien
- Dokument-Info und XMP, wenn sie Namen oder Pfade tragen
- PieceInfo, Thumbnails, unbenutzte Objekte

**Verifikation.** Nach dem Lauf zeigt der Report, was noch auffindbar ist. Download ist vorher möglich, aber nicht „shared-safe“.

**Nicht verwechseln.** Sanitize löscht keine Klarnamen im Fließtext. Dafür ist [Schwärzen](/guides/redact) da. Beide Schritte hintereinander — zuerst redigieren, dann sanitizen — sind der übliche Weg zur Akte nach außen.
