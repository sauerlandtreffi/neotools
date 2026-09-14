---
title: Strip image metadata
locale: en
tool: image-metadata
formats:
  - jpg
  - png
  - webp
updated: "2026-09-14"
description: Read or strip EXIF, GPS and XMP. Then verification. Privacy-sensitive.
---

`image-metadata` reads EXIF, IPTC, XMP, ICC and GPS (decimal plus a map link as text). The tool is `privacySensitive`: a verify step runs after strip.

**`mode`.**

- `read` — report only.
- `strip-all` — Exif, XMP, ICC, IPTC (JPEG segments) or a re-encode without meta.
- `strip-gps` — GPS fields.
- `strip-software` — software and serial.
- `edit` — sets `copyright`, `artist`, `description`, `datetimeOriginal` plus `timezoneHours`.

**Presets.** `read`, `strip-all`, `strip-gps`, `edit`.

GPS in a photo is often why a holiday picture leaks a home address. Use `strip-all` before sending, then read the verify report.
