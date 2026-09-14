---
title: HEIC to JPEG — why the iPhone photo is blank elsewhere
locale: en
tool: image-convert
formats:
  - heic
  - heif
  - jpg
updated: "2026-09-14"
description: HEIC is HEIF plus HEVC. Windows and many browsers cannot read it. Convert to JPEG locally.
---

iPhones often store photos as **HEIC**: a HEIF container with an HEVC image. Chrome and Firefox do not decode it. Windows shows an empty preview without an extra codec. An upload “as an image” fails quietly.

**What to do.** Convert locally to JPEG (or PNG if you need a still with transparency/depth). Once `image-convert` is registered, [/convert/heic-to-jpg](/en/convert/heic-to-jpg) opens the tool with the format preselected.

**What you lose.** JPEG has no alpha and is lossy. Live Photos (still + video) are two files — this path converts the still only.

**Licensing.** HEVC is patent-encumbered. NeoTools decodes HEIC when the image pack is attached; it does not sell an HEVC license. JPEG is the compatible target for sharing.
