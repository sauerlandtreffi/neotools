---
title: Schwärzen richtig — Overlay ist keine Entfernung
locale: de
tool: pdf-redact
formats:
  - pdf
updated: "2026-09-14"
description: Warum ein schwarzes Rechteck nicht reicht und wie echte Redaction plus Verifikation läuft.
---

Ein schwarzes Rechteck über einem Namen ist **keine** Schwärzung. Der Text bleibt im Content-Stream, in ToUnicode, oft in Bild-XObjects. Jeder mit einem Textwerkzeug liest ihn wieder.

**Was `pdf-redact` tut.** Markierte Regionen entfernen Textoperatoren (`Tj`, `TJ`) und rastern Bildbereiche so, dass der Inhalt nicht unter der Farbe liegt. Danach läuft eine Verifikation: erneuter Extract, Muster, Pixelstichprobe.

**Overlay vs. Entfernung.**

| Methode | Sichtbar? | Im File? |
| --- | --- | --- |
| Schwarzes Annot-Rechteck | verdeckt | Text bleibt |
| Weiße Form XObject | verdeckt | Text bleibt |
| Content entfernen + Raster | weg | weg, wenn Verify grün ist |

**Nicht tun.** „Drucken als PDF“ über die Overlay-Seite. Das brennt oft nur Pixel, lässt aber andere Objekte stehen — oder erzeugt ein neues, ungeschwärztes Text-Layer.

Erst herunterladen, wenn die Checkliste `entfernt` zeigt. Rot oder unsicher heißt: nacharbeiten, nicht teilen.
