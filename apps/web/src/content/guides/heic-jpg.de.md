---
title: HEIC nach JPEG — warum das iPhone-Foto woanders leer bleibt
locale: de
tool: image-convert
formats:
  - heic
  - heif
  - jpg
updated: "2026-09-14"
description: HEIC ist HEIF plus HEVC. Windows und viele Browser können das nicht. Lokal nach JPEG wandeln.
---

iPhones speichern Fotos oft als **HEIC**: ein HEIF-Container mit HEVC-Bild. Chrome und Firefox dekodieren das nicht. Windows zeigt ohne Extra-Codec eine leere Vorschau. Ein Upload „als Bild“ scheitert still.

**Was zu tun ist.** Lokal nach JPEG (oder PNG, wenn Transparenz/Depth-Still nötig ist) wandeln. Sobald `image-convert` registriert ist, öffnet [/convert/heic-to-jpg](/convert/heic-to-jpg) das Werkzeug mit vorbelegtem Format.

**Was verloren geht.** JPEG hat kein Alpha und ist verlustbehaftet. Live Photos (Still + Video) sind zwei Dateien — nur das Standbild wandelt dieser Weg.

**Lizenz.** HEVC ist patentbehaftet. NeoTools dekodiert HEIC, wenn das Bild-Pack hängt; es verkauft keine HEVC-Lizenz. Für den Versand ist JPEG das kompatible Zielformat.
