---
title: Merge PDFs without wrecking the file
locale: en
tool: pdf-merge
formats:
  - pdf
updated: "2026-09-14"
description: Join several PDFs locally, add bookmarks, check trailing empty pages.
---

Joining filings into one file is the most common PDF step. In NeoTools, `pdf-merge` runs in the browser: files are not uploaded.

**Order.** The drop zone keeps selection order. If you need exhibit numbers, sort first or use the outline preset.

**Bookmarks.** The “file with bookmarks” preset adds one outline entry per source. That is not a table of contents, but it stops blind scrolling.

**Empty pages.** Some scanners append a blank verso. `dropTrailingEmpty` drops only *trailing* blanks, not intentional separators in the middle.

**Afterward.** If you will send the file, [sanitize](/en/guides/sanitize) next — merge copies metadata and embedded files along.
