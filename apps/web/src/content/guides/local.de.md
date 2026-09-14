---
title: Warum lokal statt Upload
locale: de
formats:
  - pdf
updated: "2026-09-14"
description: Kein Server sieht die Datei. So prüfst du das selbst im Netzwerk-Tab.
---

SaaS-PDF-Seiten verlangen einen Upload, speichern oft eine Kopie und setzen ein Wasserzeichen. NeoTools läuft als statische Seite plus Web Worker. Die Datei bleibt im Tab, in OPFS oder im Verlauf auf *diesem* Gerät.

**Was „kein Upload“ heißt.** Es gibt keinen API-Endpunkt, der Dateibytes entgegennimmt. WASM und Modelle kommen von derselben Origin (`/assets/…`), nicht von einem CDN.

**Selbst prüfen.**

1. DevTools öffnen → Network.
2. Eine Datei verarbeiten.
3. Es darf **kein** Request zu einem fremden Host mit der Datei als Body erscheinen.
4. Die Anzeige „0 Bytes gesendet“ im Tool-Header zählt nur *fremde* Origins. Same-Origin-Scripts zählen nicht als Upload.

Details: [/no-upload](/no-upload). Wer Self-Hostet, liefert nur HTML/JS/WASM — der Container sieht den Inhalt der Nutzerdatei nicht.
