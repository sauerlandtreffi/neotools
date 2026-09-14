---
title: Find duplicates
locale: en
tool: files-duplicates
formats:
  - zip
updated: "2026-09-14"
description: SHA-256 groups. Report with a delete suggestion, no deletion. Perceptual stays in image-duplicates.
---

`files-duplicates` hashes every chosen file or a folder (`directory: true`). Same bytes, same hash.

**Options.** `rootPath` — optional start path when the platform supplies a tree (CLI/desktop). In the browser, multi-select is enough.

**Output.** `duplicates.json` / `.md`: per group `keep` (first file) and `deleteSuggest`. Nothing is deleted.

Similar but not bit-identical photos: `image-duplicates` (perceptual). Do not mix that with hash duplicates.
