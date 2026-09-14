---
title: Validate an e-invoice
locale: en
tool: dach-erechnung-validate
formats:
  - xml
  - pdf
updated: "2026-09-14"
description: Validate XRechnung, ZUGFeRD and Factur-X locally and render HTML, PDF or Markdown.
---

`dach-erechnung-validate` reads XML or a PDF with embedded CII/UBL. It checks well-formedness, profile, EN 16931 BT fields, a set of BR rules, and arithmetic.

**Options.** Only `locale` (`de`/`en`) for the view.

**Inputs.** XML (`application/xml`, `text/xml`), JSON or PDF. Several files, one after another.

**Output per file.** `{stem}-report.json`, `{stem}.md`, `{stem}.html`, `{stem}-view.pdf`. The view PDF is a rendering, not a new legally issued invoice.

**Do not.** Ignore a red report field and send the XML to a routing ID anyway. Close the findings first, then generate or re-check.
