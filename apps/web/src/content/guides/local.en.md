---
title: Why local instead of upload
locale: en
formats:
  - pdf
updated: "2026-09-14"
description: No server sees the file. How to verify that yourself in the network tab.
---

SaaS PDF sites ask for an upload, often keep a copy, and stamp a watermark. NeoTools is a static page plus a web worker. The file stays in the tab, in OPFS, or in history on *this* device.

**What “no upload” means.** There is no API endpoint that accepts file bytes. WASM and models come from the same origin (`/assets/…`), not from a CDN.

**Check it yourself.**

1. Open DevTools → Network.
2. Process a file.
3. There must be **no** request to a foreign host with the file as the body.
4. The “0 bytes sent” readout in the tool header counts *foreign* origins only. Same-origin scripts are not an upload.

Details: [/en/no-upload](/en/no-upload). Self-hosting serves HTML/JS/WASM only — the container never sees the user’s file contents.
