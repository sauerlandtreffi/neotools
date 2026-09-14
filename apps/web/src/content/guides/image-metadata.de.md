---
title: Metadaten entfernen
locale: de
tool: image-metadata
formats:
  - jpg
  - png
  - webp
updated: "2026-09-14"
description: EXIF, GPS, XMP lesen oder strippen. Danach Verifikation. Privacy-sensitiv.
---

`image-metadata` liest EXIF, IPTC, XMP, ICC und GPS (Dezimal plus Karten-Link als Text). Das Tool ist `privacySensitive`: nach Strip läuft eine Verifikation.

**`mode`.**

- `read` — nur Report.
- `strip-all` — Exif, XMP, ICC, IPTC (JPEG-Segmente) bzw. Re-Encode ohne Meta.
- `strip-gps` — GPS-Felder.
- `strip-software` — Software und Seriennummer.
- `edit` — setzt `copyright`, `artist`, `description`, `datetimeOriginal` plus `timezoneHours`.

**Presets.** `read`, `strip-all`, `strip-gps`, `edit`.

GPS im Bild ist oft der Grund, warum ein Urlaubsfoto den Wohnort verrät. `strip-all` vor dem Versand, dann den Verify-Report lesen.
