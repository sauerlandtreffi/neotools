---
title: Checking beA / ERV conformance
locale: en
tool: dach-bea-erv
formats:
  - pdf
updated: "2026-09-14"
description: Check PDFs against the ERV rule set, optionally auto-fix. Not a substitute for EGVP docs.
---

`dach-bea-erv` checks PDFs locally against a versioned rule set (file name, size, JavaScript, forms, PDF/A, text layer). The report cites ERVV §2/§5 and ERVB.

**Options.**

- `autoFix` (`false`): check only. Preset `check`.
- `autoFix` (`true`): preset `autofix` — the engine runs the stored auto-fix pipeline (sanitize and related PDF steps) if those tools are loaded.
- `locale`: `de` or `en` for the Markdown report.

**Output.** `erv-report.json`, `erv-report.md`, a traffic-light in the report. Green here is not automatically “court-ready”. The receiving body’s current docs win.

**Next.** PDF/A separately with [`pdf-a`](/en/guides/pdfa) (`mode`, `profile` `2b`/`3b`). Strip active content first with [`pdf-sanitize`](/en/guides/sanitize).
