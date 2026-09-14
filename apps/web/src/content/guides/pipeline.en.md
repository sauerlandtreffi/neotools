---
title: Build a pipeline
locale: en
formats:
  - pdf
updated: "2026-09-14"
description: Steps as JSON, MIME binding, share via the URL hash. Nothing is stored on a server.
---

A pipeline is a list `{ toolId, options }` (plus optional binds). The engine checks that the output MIME is in the next step’s `accept`.

**Web.** [/en/pipeline](/en/pipeline) — pick steps, set options, import/export JSON. Five library presets sit in the palette. Share: hash `#p=…` (Base64url), client-side only. Too large: a `.neopipeline.json` file.

**CLI.**

```
neotools pipeline pipeline.json input.pdf -o output
```

**Typical pair.** `pdf-redact` (after verify) → `pdf-sanitize` (`removeAnnotations`, `flattenForms`). Team presets can force a required chain (`requiredPipelines`).

Intermediates live in OPFS. One broken file in a batch does not stop the others (`ok|error`).
