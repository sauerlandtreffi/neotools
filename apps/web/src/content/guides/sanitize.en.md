---
title: Sanitize before you send
locale: en
tool: pdf-sanitize
formats:
  - pdf
updated: "2026-09-14"
description: Remove JavaScript, attachments, metadata and hidden layers before sharing.
---

A PDF that is “just for reading” can still carry JavaScript, embedded files, author fields, thumbnails and optional content groups. `pdf-sanitize` cleans that locally.

**Remove at least this before external mail.**

- OpenAction / JavaScript
- File attachments and embedded files
- Document info and XMP if they carry names or paths
- PieceInfo, thumbnails, unused objects

**Verification.** After the run the report shows what is still findable. Download is possible earlier, but that is not “shared-safe”.

**Do not confuse.** Sanitize does not delete names in the body text. That is [redaction](/en/guides/redact). Both steps in sequence — redact first, then sanitize — is the usual path for a file leaving the office.
