---
title: Eine Pipeline bauen
locale: de
formats:
  - pdf
updated: "2026-09-14"
description: Schritte als JSON, MIME-Bindung, Teilen über den URL-Hash. Nichts liegt auf einem Server.
---

Eine Pipeline ist eine Liste `{ toolId, options }` (plus optionale Bindung). Die Engine prüft, ob der Output-MIME im `accept` des nächsten Schritts liegt.

**Web.** [/pipeline](/pipeline) — Schritte wählen, Optionen setzen, JSON importieren/exportieren. Fünf Bibliotheks-Presets liegen in der Palette. Teilen: Hash `#p=…` (Base64url), bleibt clientseitig. Zu groß: Datei `.neopipeline.json`.

**CLI.**

```
neotools pipeline pipeline.json eingabe.pdf -o ausgabe
```

**Typisches Paar.** `pdf-redact` (nach Verify) → `pdf-sanitize` (`removeAnnotations`, `flattenForms`). Team-Presets können eine erforderliche Kette erzwingen (`requiredPipelines`).

Zwischenergebnisse liegen in OPFS. Eine kaputte Datei im Batch stoppt nicht die anderen (`ok|error`).
