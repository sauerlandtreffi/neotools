---
title: Redaction done right — overlay is not removal
locale: en
tool: pdf-redact
formats:
  - pdf
updated: "2026-09-14"
description: Why a black rectangle is not enough, and how real redaction plus verification works.
---

A black rectangle over a name is **not** redaction. The text stays in the content stream, in ToUnicode, often in image XObjects. Anyone with a text tool can read it again.

**What `pdf-redact` does.** Marked regions drop text operators (`Tj`, `TJ`) and raster image areas so the content is not sitting under the paint. Verification then re-extracts, re-runs patterns, and samples pixels.

**Overlay vs removal.**

| Method | Visible? | In the file? |
| --- | --- | --- |
| Black annotation rectangle | covered | text remains |
| White form XObject | covered | text remains |
| Remove content + raster | gone | gone if verify is green |

**Do not.** “Print to PDF” over an overlay page. That often burns pixels while leaving other objects — or creates a fresh, unredacted text layer.

Download only when the checklist says removed. Red or uncertain means fix it, do not share.
