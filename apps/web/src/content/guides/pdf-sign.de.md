---
title: PDF signieren und prüfen
locale: de
tool: pdf-sign
formats:
  - pdf
updated: "2026-09-14"
description: PAdES prüfen im Browser. Signieren mit PKCS#12. TSA nur wenn eine URL gesetzt ist.
---

`pdf-sign` hat zwei Modi.

**Prüfen.** Preset `verify`, `mode: verify`. PDF legen, Report `signature-report.json` / `.md`. `locale` steuert die Sprache. Eine nachträgliche inkrementelle Änderung steht als Warnung.

**Signieren.** Preset `sign-visible` oder `sign-invisible`. Zusätzlich eine `.p12`/`.pfx`. Optionen:

- `password` (Feldtyp Passwort).
- `visible`, `page`, `x`, `y`, `width`, `height` für das Erscheinungsbild.
- `tsaUrl`: leer = kein Netz. Nur wenn gesetzt, RFC-3161-Abruf zur eingetragenen TSA.

WebCrypto erzeugt die Signatur auf dem Gerät. Kein Upload des Schlüssels.
