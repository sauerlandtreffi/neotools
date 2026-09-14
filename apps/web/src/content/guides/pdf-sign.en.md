---
title: Sign and verify a PDF
locale: en
tool: pdf-sign
formats:
  - pdf
updated: "2026-09-14"
description: Verify PAdES in the browser. Sign with PKCS#12. TSA only if a URL is set.
---

`pdf-sign` has two modes.

**Verify.** Preset `verify`, `mode: verify`. Drop a PDF, read `signature-report.json` / `.md`. `locale` sets the language. A later incremental change shows as a warning.

**Sign.** Preset `sign-visible` or `sign-invisible`. Also drop a `.p12`/`.pfx`. Options:

- `password` (password field).
- `visible`, `page`, `x`, `y`, `width`, `height` for the appearance.
- `tsaUrl`: empty = no network. Only if set, an RFC 3161 call to that TSA.

WebCrypto creates the signature on the device. The key is not uploaded.
