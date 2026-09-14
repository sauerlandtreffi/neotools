---
title: Social-Card und OG-Bild lokal
locale: de
tool: creator-social-card
formats:
  - png
  - jpeg
updated: "2026-09-14"
description: OG- und Social-Karten mit Template, Titel und Untertitel — ohne Upload.
---

`creator-social-card` rendert eine Karte auf dem Gerät. Optionen: `template` (`og` 1200×630, `twitter` 1600×900, `square` 1080×1080), `title`, `subtitle`, `background` (Hex).

Ein Bild wird als Cover gelegt (`coverFit`). Eine Datei mit `logo` im Namen sitzt oben links. Text kommt aus der gebündelten OFL-Font (`applyTextWatermark`).

**Danach.** Für Favicon- und App-Icon-Sätze `creator-export-pack` mit Preset `favicon` oder `og`. Specs prüft `creator-spec-check` gegen die Format-KB.
