---
title: Hintergrund entfernen
locale: de
tool: image-remove-background
formats:
  - png
  - webp
  - jpg
updated: "2026-09-14"
description: Freisteller lokal mit U²-Net oder IS-Net. Modell vom eigenen Origin, nach Bestätigung.
---

`image-remove-background` segmentiert auf dem Gerät (ONNX). Das ist ein Hilfswerkzeug, kein Studio-Versprechen.

**Optionen.**

- `model`: `u2netp` (Default) oder `isnet-general-q8`.
- `threshold` (Default `0.45`), `feather` (Default `2`).
- `background`: `transparent`, `color` (`color` als Hex, Default `#ffffff`), `image` (zweite Datei, Name enthält `bg` oder `hintergrund`).
- `format`: `png` oder `webp`, `quality` 0.1–1 (Default `0.92`).
- `confirmModelDownload`: muss `true` sein, bevor das Modell vom eigenen Origin geladen wird.

**Presets.** `cutout` (transparent, PNG), `white` (Farbe `#ffffff`).

Kanten an Haaren und Glas bleiben oft unsauber. Dann `feather` erhöhen oder manuell nacharbeiten.
