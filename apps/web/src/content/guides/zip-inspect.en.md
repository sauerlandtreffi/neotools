---
title: Inspect a ZIP safely
locale: en
tool: archive-inspect
formats:
  - zip
  - tar
updated: "2026-09-14"
description: List without a full extract. Double extensions, executables, zip-bomb ratio. Then archive-test.
---

List an archive first, then extract selected paths. `archive-inspect` reads ZIP natively, TAR and TAR.GZ as a tree. No full extract.

**What the report flags.** Double extensions, executable names, warnings including a suspicious compression ratio. Output `archive-inspect.json` / `.md`. There are no option fields.

**Integrity.** `archive-test` checks CRC/read, detects truncated files, suggests repair — **no** auto-repair.

**Extract.** `archive-extract` or `archive-extract-selected`, not a blind full extract. 7z only through the dynamic LGPL path when loaded.
