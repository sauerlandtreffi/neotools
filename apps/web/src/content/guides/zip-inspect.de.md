---
title: ZIP sicher prüfen
locale: de
tool: archive-inspect
formats:
  - zip
  - tar
updated: "2026-09-14"
description: Inhalt ohne volles Entpacken. Doppelendung, Executable, Zip-Bomb-Ratio. Danach archive-test.
---

Ein Archiv erst listen, dann gezielt entpacken. `archive-inspect` liest ZIP nativ, TAR und TAR.GZ als Baum. Kein volles Extract.

**Was der Report markiert.** Doppelendung, Executable-Namen, Warnungen inkl. verdächtiger Kompressionsrate. Ausgabe `archive-inspect.json` / `.md`. Es gibt keine Options-Felder.

**Integrität.** `archive-test` prüft CRC/Lesen, erkennt truncated, schlägt Reparatur vor — **kein** Auto-Repair.

**Entpacken.** `archive-extract` oder `archive-extract-selected`, nicht blind das ganze Archiv. 7z nur über den dynamischen LGPL-Pfad, wenn geladen.
