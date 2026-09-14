---
title: PDFs zusammenführen, ohne die Akte zu zerstören
locale: de
tool: pdf-merge
formats:
  - pdf
updated: "2026-09-14"
description: Mehrere PDFs lokal verbinden, Lesezeichen setzen, leere Endseiten prüfen.
---

Mehrere Schriftsätze zu einer Datei zu machen, ist der häufigste PDF-Schritt. In NeoTools läuft `pdf-merge` im Browser: die Dateien werden nicht hochgeladen.

**Reihenfolge.** Die Drop-Zone behält die Auswahlreihenfolge. Wer Aktenzeichen oder Anlagennummern braucht, sollte die Dateien vorher sortieren oder das Outline-Preset nutzen.

**Lesezeichen.** Das Preset „Akte mit Lesezeichen“ legt je Quelldatei einen Outline-Eintrag an. Das ersetzt kein Inhaltsverzeichnis, verhindert aber das Blättern im Blindflug.

**Leere Seiten.** Manche Scanner hängen eine leere Rückseite an. `dropTrailingEmpty` wirft nur *trailing* Leerseiten weg, keine absichtlich leeren Trennblätter in der Mitte.

**Danach.** Wer die Datei versendet, sollte als Nächstes [sanitizen](/guides/sanitize) — Merge kopiert Metadaten und eingebettete Dateien mit.
