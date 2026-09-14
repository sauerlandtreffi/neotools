---
title: PDF/A for authorities — without Ghostscript
locale: en
tool: pdf-a
formats:
  - pdf
  - pdfa
updated: "2026-09-14"
description: How PDF/A differs from plain PDF, and why validation must stay honest.
---

Authorities and archives often want **PDF/A**, not “any PDF”. PDF/A is a *profile*: embedded fonts, XMP, no encryption, no JavaScript, defined colour handling.

**What NeoTools will not do.** There is no Ghostscript and no MuPDF here (AGPL). `pdf-a` converts best-effort with pdf-lib and, when it cannot prove compliance, it does **not** say “valid” — it lists violations.

**In practice.**

1. Prefer sources without missing fonts, or embed fonts first.
2. Strip JavaScript, attachments and open actions ([Sanitize](/en/guides/sanitize)).
3. Validate. A green check without a report is worthless.

**beA/ERV.** PDF/A alone is not automatically court-ready. Size, version and active content are checked separately by [dach-bea-erv](/en/spec/bea-erv). The body’s current EGVP docs win, not this page.
