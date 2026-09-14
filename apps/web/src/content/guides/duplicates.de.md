---
title: Duplikate finden
locale: de
tool: files-duplicates
formats:
  - zip
updated: "2026-09-14"
description: SHA-256-Gruppen. Report mit Lösch-Vorschlag, kein Löschen. Perceptual bleibt image-duplicates.
---

`files-duplicates` hasht alle gewählten Dateien oder einen Ordner (`directory: true`). Gleiche Bytes, gleicher Hash.

**Optionen.** `rootPath` — optionaler Startpfad, wenn die Plattform einen Ordnerbaum liefert (CLI/Desktop). Im Browser reicht die Mehrfachauswahl.

**Ausgabe.** `duplicates.json` / `.md`: je Gruppe `keep` (erste Datei) und `deleteSuggest`. Es wird nichts gelöscht.

Ähnliche, aber nicht bitgleiche Fotos: `image-duplicates` (perceptual). Nicht mit Hash-Duplikaten mischen.
