🇬🇧 English · [🇩🇪 Deutsch](./BACKLOG.de.md)

# NeoTools Backlog

Related: [ARCHITECTURE.md](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md)

Canonical tool list. UI, CLI, pipelines, SEO pages and docs are generated from `defineTool`. IDs are stable (kebab-case); renames only via alias, never by changing the ID.

## Legend

| Column | Meaning |
|---|---|
| ID | stable tool ID |
| Title | UI title (English; the German UI title lives in the tool definition) |
| Pack | npm package / plugin pack |
| Implementation | libraries **or** `FFmpeg preset → <core-id>` |
| Effort | S ≤ 1 day · M 2–4 days · L 1–2 weeks · XL > 2 weeks |
| Phase | 1 core/PDF/privacy · 2 image · 3 FFmpeg · 4 speech/office/DACH · 5 creator/AI/exotic |
| Merged from | source ideas that are absorbed into this tool/preset |
| Note | scope, presets, bans |

Pack names = packages: `pdf` → `packages/tools-pdf`, `image` → `tools-image`, `media` → `tools-media`, `speech` → `tools-speech`, `forensics` → `tools-forensics`, `office` → `tools-office`, `archive` → `tools-archive`, `dach` → `tools-dach`. Additionally, logical packs without their own package in phase 1: `creator` and `a11y` (live in `image`/`media`/`pdf` until phase 5, then move out), `platform` (engine/apps, no tool runtime).

## Phases (binding)

| Phase | Content |
|---|---|
| 1 | engine + PDF package + redaction + forensics basics + web/CLI/Docker/Tauri scaffolding |
| 2 | image core + archives + export pack + screenshot studio |
| 3 | FFmpeg core (video+audio) incl. simple filters as presets |
| 4 | Whisper/WebGPU + office/e-books + DACH deepening + a11y core |
| 5 | remaining creator tools, AI showcases, exotic formats, community plugins |

---

## Pack `pdf` — `packages/tools-pdf`

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| pdf-merge | Merge PDFs | pdf | pdf-lib | S | 1 | Merge | bookmarks optionally as outline | ✅ done |
| pdf-split | Split PDF | pdf | pdf-lib | S | 1 | Split | ranges, single pages, every-n | ✅ done |
| pdf-compress | Compress PDF | pdf | pdf-lib, pdfjs-dist, jSquash | M | 1 | Compress | re-encode images; no Ghostscript | ✅ done |
| pdf-rotate | Rotate PDF | pdf | pdf-lib | S | 1 | Rotate | page/range, 90/180/270 | ✅ done |
| pdf-reorder | Reorder pages | pdf | pdf-lib | S | 1 | Reorder | drag-and-drop UI; CLI: index list | ✅ done |
| pdf-watermark | Watermark (PDF) | pdf | pdf-lib | M | 1 | Watermark | text/image, tiling, opacity | ✅ done |
| pdf-redact | Redact | pdf | pdf-lib, pdfjs-dist, Transformers.js NER, Tesseract.js | XL | 1 | Redact; click redaction; auto patterns; auto NER; verification afterwards | patterns: IBAN, tax ID, social security no., ID card no., license plate, e-mail, phone. Names locally via NER. Remove pixels + text (not paint over). Mandatory: verification step | ✅ done |
| pdf-lock | Lock / unlock | pdf | qpdf WASM | M | 1 | Lock; unlock | encrypt/decrypt, permissions | ✅ done |
| pdf-sign | Verify / create PAdES | pdf | pdfjs-dist, WebCrypto, PKCS#12 (desktop/CLI) | L | 1 | Sign; PAdES; PKCS#12 | browser: verify. Create: Tauri/CLI (keystore). No iText | ✅ done |
| pdf-forms | Forms | pdf | pdf-lib, pdfjs-dist | M | 1 | Forms | read, fill, flatten | ✅ done |
| pdf-ocr | OCR → searchable PDF | pdf | Tesseract.js (deu+eng), pdfjs-dist, pdf-lib | L | 1 | OCR | text layer; language selectable | ✅ done |
| pdf-to-images | PDF → JPG/PNG | pdf | pdfjs-dist, optional PDFium WASM | S | 1 | PDF→JPG/PNG | dpi, range, format | ✅ done |
| images-to-pdf | Images → PDF | pdf | pdf-lib | S | 1 | Images→PDF | page size, fit, dpi | ✅ done |
| pdf-compare | Compare document / contract | pdf | pdfjs-dist, text diff, pixel diff | L | 1 | PDF compare; contract version compare | presets: `text-pdf`, `pixel`, `vertrag`. Output: diff PDF | ✅ done |
| pdf-a | Convert & validate PDF/A | pdf | pdf-lib, veraPDF WASM or similar (no Ghostscript, no MuPDF) | L | 1 | PDF/A | target PDF/A-2b/3b; validation report | ✅ done |
| pdf-sanitize | Sanitize for sharing | pdf | pdf-lib, qpdf WASM | L | 1 | Sanitize; "share safely" pack (PDF part) | JS, embedded files, metadata, unused objects, hidden layers. Verification afterwards | ✅ done |
| pdf-aktenbundler | Case-file bundler (Aktenbundler) | pdf | pdf-lib | L | 1 | Case-file bundler | table of contents, bookmarks, Bates stamp, uniform header | ✅ done |
| pdf-form-mailmerge | Form mail merge | pdf | pdf-lib | M | 4 | Bulk form filling from CSV | one record → one PDF | ✅ done |
| pdf-attachment-stamp | Attachment stamp | pdf | pdf-lib | M | 4 | Attachment stamp | "Anlage 3 zu Az. …" (exhibit 3 to case no. …), page/Bates | ✅ done |
| pdf-ua | Check & repair PDF/UA / BITV | pdf | pdfjs-dist, pdf-lib, axe-like rule engine | L | 4 | PDF/UA/BITV | tags, language, alt, reading order. Repair best-effort | ✅ done |

---

## Pack `dach` — `packages/tools-dach`

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| dach-bea-erv | beA / ERV compliance | dach | pdfjs-dist, rule set (JSON) | M | 1 | beA/ERV check | file size, PDF version, JS, encryption, fonts, attachments. Report, no submission | ✅ done |
| dach-hash-timestamp | Document hash + RFC 3161 | dach | WebCrypto SHA-256, TSA client | M | 1 | document hash; RFC 3161 timestamp | TSA URL configurable; attach token | ✅ done |
| dach-deadline | Deadlines / dates → ICS/CSV | dach | pdfjs-dist, Tesseract.js, regex+NER | M | 4 | deadline/date extractor | hits with page; ICS + CSV | ✅ done |
| dach-erechnung-validate | Validate / view E-Rechnung | dach | XML parser, Schematron/XSD locally, pdf-lib (ZUGFeRD) | L | 4 | E-Rechnung validator/viewer; ZUGFeRD; XRechnung; Factur-X | no third-party upload | ✅ done |
| dach-erechnung-generate | Generate E-Rechnung | dach | XML writer, pdf-lib (PDF/A-3 + ZUGFeRD) | L | 4 | E-Rechnung generator | profile selectable; validation afterwards | ✅ done |
| dach-paper-to-erechnung | Paper invoice → E-Rechnung | dach | Tesseract.js, NER, dach-erechnung-generate | XL | 4 | paper invoice assistant | human confirms fields before export | ✅ done |
| dach-receipt-split | Receipt splitter | dach | pdf-lib, pdfjs-dist, scenes/blank pages | M | 4 | receipt splitter | stack → single PDFs | ✅ done |
| dach-receipt-export | Receipt data → DATEV/Lexoffice/sevDesk | dach | OCR+NER, CSV writer | L | 4 | receipt data export; invoice→JSON/CSV | presets: DATEV, Lexoffice, sevDesk, JSON | ✅ done |
| dach-statement-camt | Bank statement PDF → CSV/CAMT | dach | pdfjs-dist, table heuristics | L | 4 | bank statement export | bank presets extensible | ✅ done |
| dach-gobd | GoBD archive package | dach | JSZip, WebCrypto | L | 4 | GoBD archive package | hash manifest, directory, immutable storage | ✅ done |
| dach-amtlich | Pipeline "official publication" | dach | pipeline preset (pdf-a, pdf-ua, sanitize, hash) | M | 4 | official publication | no own binary; serialized pipeline | open |
| dach-posteingang | Digitize incoming mail | dach | image-doc-repair + pdf-ocr + pdf-aktenbundler + dach-deadline | L | 4 | incoming-mail digitization | pipeline preset + UI wizard | open |
| dach-girocode | GiroCode / EPC QR | dach | zxing-wasm | S | 4 | GiroCode; EPC QR | generate + read; SEPA fields | ✅ done |
| dach-team-presets | Team presets / policies | dach | JSON schema, signature optional | M | 4 | team presets/policies JSON | white-label/Docker; lock tools, default options | ✅ done |

---

## Pack `forensics` — `packages/tools-forensics`

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| forensics-identify | Identify file | forensics | magic bytes, container parsers | M | 1 | identify file; fake extension (part) | MIME vs. extension vs. content | ✅ done |
| forensics-autopsy | File autopsy | forensics | parser per container | M | 1 | file autopsy | trees: PDF objects, ZIP, MP4 boxes, ID3 | ✅ done |
| forensics-bytes-compare | Exact bytes compare | forensics | SHA-256, block diff | S | 1 | exact bytes compare | offset list | ✅ done |
| forensics-hash | Hash output | forensics | WebCrypto | S | 1 | hash output; SHA-256 manifest (single file) | SHA-256/512; clipboard | ✅ done |
| forensics-hidden-data | Hidden data radar | forensics | PDF parser, ZIP-after-JPEG, polyglot signatures | L | 1 | hidden layer check; hidden data radar; ZIP behind JPEG; polyglot | layers, attachments, overflow, dual content | ✅ done |
| forensics-fake-ext | Fake extension | forensics | forensics-identify | S | 1 | fake extension | report tool; UI warning reusable | ✅ done |
| forensics-share-safe | Safe to share? | forensics | orchestrates sanitize + radar + PII scan | L | 1 | safe to share?; "share safely" pack; audit report (trigger) | checklist + one-click sanitize. Verification afterwards | ✅ done |
| forensics-verify | Privacy verification | forensics | engine hook, re-scan, text search, pixel sample | M | 1 | verification after privacy operation | mandatory after `pdf-redact`, `pdf-sanitize`, `image-redact`, `image-auto-blur`, `image-metadata` (strip) | open |
| forensics-provenance | Provenance manifest | forensics | JSON + source hash + pipeline + parameters | M | 1 | provenance manifest | optional with output; no PII of the contents | ✅ done |
| forensics-fingerprint | Document fingerprint | forensics | perceptual hash, font/printer features | M | 1 | document fingerprint | no cloud matching | ✅ done |
| forensics-watermark-find | Find watermark | forensics | pdfjs-dist, canvas, heuristics | M | 1 | find watermark | **detection only.** Removal via inpainting forbidden | ✅ done |
| forensics-stego | Stego sniff | forensics | LSB/statistics, container attachments | L | 2 | stego sniff | suspicion only; no extraction of arbitrary payloads as a feature pitch | open |
| forensics-reencode | Re-encode generations | forensics | quantization artifacts, EL | L | 2 | re-encode generations | estimate, not a court expert opinion | open |
| forensics-visual-diff | Visual diff | forensics | pixel diff, SSIM | M | 2 | visual diff | overlaps `pdf-compare` preset `pixel`; images + rendered PDF pages | open |
| forensics-pii-report | PII / traces report | forensics | Tesseract, NER, EXIF, fonts | L | 2 | faces/texts/GPS/fonts/printer codes report | no biometric matching network beyond what is needed locally for boxes | open |
| forensics-network | Network evidence package | forensics | HAR parser (local), hash | M | 5 | network evidence | only local HAR/PCAP metadata; no capture | open |
| forensics-audit-pdf | Audit report PDF | forensics | pdf-lib | M | 2 | audit report PDF; audit log (export) | summarizes verification + provenance + share-safe | open |

---

## Pack `image` — `packages/tools-image`

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| image-convert | Convert image | image | jSquash, heic-decode, UTIF, own SVG/ICO path | L | 2 | image converter; HEIC→JPG; TIFF read/write; JXL; APNG; TGA; PPM/PGM/PBM; ICO; BMP; GIF; WEBP; AVIF | **wave 2 formats:** JPG, PNG, WEBP, AVIF, GIF, BMP, TIFF, ICO, HEIC, SVG, TGA, PPM, PGM, PBM, APNG, JXL. **Not here:** PSD, EXR, DDS, XWD, JPEG 2000 → exotic | ✅ done |
| image-compress | Compress image | image | jSquash (mozjpeg/oxipng/avif/webp/jxl) | M | 2 | compress; smaller without loss of sharpness | preset `visuell-lossless`: SSIM loop | ✅ done |
| image-resize | Resize | image | canvas / jSquash | S | 2 | resize pixels/percent, bulk | Lanczos | ✅ done |
| image-rotate-flip | Rotate / flip | image | canvas | S | 2 | rotate/flip | correct EXIF orientation | ✅ done |
| image-crop | Crop | image | canvas | S | 2 | crop | aspect ratio presets | ✅ done |
| image-adjust | Adjust | image | canvas/WebGL | S | 2 | brightness, contrast, saturation | histogram preview | ✅ done |
| image-watermark | Watermark (image) | image | canvas | M | 2 | watermark | text/image; no removal | ✅ done |
| image-bg-remove | Remove background | image | ONNX Runtime Web (u2net/modnet locally) | L | 2 | remove background | model self-hosted; WebGPU | open |
| image-metadata | Read / edit / remove metadata | image | ExifParser, piexif-like (own) | M | 2 | remove metadata; read/edit EXIF/IPTC/GPS | presets: `strip-all`, `strip-gps`, `edit` | ✅ done |
| image-redact | Redact image | image | canvas | M | 2 | redact image (boxes) | boxes + verification | ✅ done |
| image-compare | Compare two images | image | pixel diff, SSIM, slider | M | 2 | compare two images | | ✅ done |
| image-to-animation | Images → GIF / video / slideshow | image | gifenc, ffmpeg.wasm, WebCodecs | M | 2 | images→GIF/video/slideshow; timelapse from a series (stills) | couple video output to FFmpeg in phase 3 | ✅ done |
| image-doc-repair | Repair document photo | image | OpenCV.js (lazy), Tesseract.js | L | 2 | document scanner; whiteboard photo; perspective correction; brighten child's drawing; remove moiré; handwritten note; whiteboard→PNG+OCR | presets: `scanner`, `whiteboard`, `kinderzeichnung`, `moire`, `notiz-ocr` | ✅ done |
| image-screenshot-studio | Screenshot studio | image | canvas, Clipboard API, EXIF, heuristics | L | 2 | screenshot washer; clipboard sanitizer; leak check; device mockup; app store frame; long screenshot; screenshot vs. photo; ID card screenshot warning | presets: `wash`, `clipboard`, `leak`, `mockup`, `store-frame`, `long`, `photo-vs-screenshot`, `id-warn` | open |
| image-auto-blur | Blur faces / license plates | image | ONNX (local), canvas | L | 2 | automatically blur faces/license plates | verification afterwards; no cloud API | ✅ done |
| image-burst-pick | Burst → best shot | image | sharpness/exposure score | M | 2 | burst→best shot | | open |
| image-livephoto | Live Photo / Motion Photo | image | HEIC/MP4 container, ffmpeg.wasm (phase 3 for video) | M | 2 | split Live Photo; Live Photo↔Motion Photo | still + video + pair | open |
| image-filmscan | Film scan kit | image | canvas, LUT, dust heuristics | L | 2 | film scan kit | invert, crop sprockets, color | open |
| image-color-match | Copy color look | image | histogram match / derive 3D LUT | M | 2 | copy color look | | open |
| image-passphoto | Passport photo cutter | image | canvas, face bbox | M | 2 | passport photo DE/EU/US; ID photo dimensions | presets: DE, EU, US | open |
| image-redeye | Red eyes | image | canvas | S | 2 | red eyes | | open |
| image-lineart | Photo → line art / coloring book | image | canvas, edges | M | 2 | photo→line art/coloring book | | open |
| image-pixelart | Photo → pixel art | image | canvas | S | 2 | photo→pixel art | palette, scale | open |
| image-svg-hatch | Photo → SVG / hatch | image | Potrace WASM or own, plotter paths | L | 2 | photo→SVG/hatch for plotters | | open |
| image-logo-svg | PNG logo → SVG | image | Potrace WASM | L | 2 | PNG logo→SVG | | open |
| image-sticker-crop | Circle crop / sticker | image | canvas | S | 2 | circle crop/sticker | | open |
| image-meme | Meme formats | image | canvas | S | 2 | meme in all aspect ratios | safe-zone overlay | open |
| image-cinemagraph | Cinemagraph | image | ffmpeg.wasm / WebCodecs | L | 3 | cinemagraph | mask + loop; depends on video core | open |
| image-collage | Collage | image | canvas | M | 2 | collage | grid presets | open |
| image-polaroid | Polaroid / film strip | image | canvas | S | 2 | Polaroid/film strip | | open |
| image-palette | Color palette + brand colors | image | k-means, WCAG contrast | M | 2 | color palette+brand kit (HEX/HSL+WCAG) | export HEX/HSL/CSS; WCAG pairs | ✅ done |
| image-dominant-css | Dominant colors → CSS/Tailwind | image | image-palette API | S | 2 | dominant colors→CSS/Tailwind | | open |
| image-lut | 3D LUT / film look | image | LUT parser, WebGL | M | 2 | 3D LUT/film look; Log→Rec.709 (LUT preset only) | preset `log-rec709` is a LUT, not a separate tone mapper | ✅ done |
| image-scopes | Scopes | image | WebGL | L | 2 | histogram, waveform, vectorscope, zebras, false color | analysis, no render export needed | ✅ done |
| image-heic-depth | Portrait HEIC depth map | image | heic-decode | M | 2 | portrait HEIC depth map | **extract only**, do not estimate depth | open |
| image-movie-barcode | Movie barcode | image | frame sample (phase 3: ffmpeg) | S | 3 | movie barcode | center strip over time | open |
| image-storyboard | Storyboard PDF | image | pdf-lib, thumbnails | M | 3 | storyboard PDF | | open |
| image-geotag-gpx | Geotag → GPX/KML | image | EXIF GPS | S | 2 | geotag→GPX/KML | | open |
| image-exif-batch | EXIF batch | image | image-metadata | M | 2 | time zone in EXIF; rename by EXIF; sort by date/camera | presets: `tz`, `rename`, `sort` | ✅ done |
| image-spritesheet | Sprite sheet / atlas | image | canvas, JSON/hash | M | 2 | sprite sheet; texture atlas; pack/unpack | | open |
| image-colorblind | Color-blindness simulator + daltonize | image | canvas matrices | M | 2 | color-blindness simulator+daltonize | shared with a11y | ✅ done |
| image-broadcast-legal | Broadcast legalizer | image | YUV clamp | M | 3 | broadcast legalizer | video frames in phase 3 | open |
| image-hdr-tonemap | HDR ↔ SDR tonemap | image | WebGL, gain map | L | 2 | HDR↔SDR tonemap | | ✅ done |
| image-icc | Color management / ICC | image | littlecms WASM or browser color | M | 2 | apply/remove ICC; color management | | ✅ done |
| image-ascii | Image → ASCII / Braille | image | canvas | S | 2 | image→ASCII/Braille | | ✅ done |
| image-seamless | Seamless texture | image | overlap/blend | M | 2 | seamless texture | | open |
| image-normalmap | Normal map | image | Sobel | M | 2 | normal map | | open |
| image-animated | Animated AVIF / WebP | image | jSquash, GIF demux | M | 2 | animated AVIF/WebP | | open |
| image-format-shootout | Format shootout | image | image-convert + SSIM/size | M | 2 | format shootout | table size/quality per codec | open |
| image-superres | Super-resolution (showcase) | image | ONNX / Transformers.js | L | 5 | super-resolution | **one** showcase, no product promise | open |
| image-denoise | Denoise (showcase) | image | ONNX | L | 5 | denoise | **one** showcase; not a "studio restorer" | ✅ done |

---

## Pack `creator` — in `tools-image` until phase 2, own pack from phase 5

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| creator-export-pack | Export pack | creator | image-convert, image-resize | L | 2 | favicon pack; Apple touch; app icon set; maskable app icon; OG card; OG/social card; web pack 1×/2× AVIF+WebP; print pack 300 dpi; social pack; platform pack; brand kit (export); product photo pack; favicon/app icon set (7.3); safe zones; size caps; spec presets (sizes part) | preset library: `favicon`, `apple-touch`, `appicon-maskable`, `og`, `web-1x2x`, `print-300`, `social`, `platform`, `brand-kit`, `produktfoto`, `safe-zone`. One pipeline, many manifest JSONs | ✅ done |
| creator-spec-check | Spec check / platform limits | creator | format knowledge base | M | 2 | spec check; platform limits; spec presets (WhatsApp, Instagram, TikTok, Shorts, Discord, e-mail 25 MB) | reads `format-kb`; applies to image+video (video checks phase 3) | ✅ done |
| creator-sticker-set | Sticker set | creator | image-sticker-crop, image-convert | M | 2 | Telegram/WhatsApp sticker set; sticker set (7.13) | pack export + size rules | ✅ done |
| creator-thumbnail | Thumbnail factory | creator | canvas, optional ffmpeg | M | 3 | thumbnail factory | title, safe zone, variants | open |
| creator-contact-sheet | Contact sheet | creator | canvas, pdf-lib | M | 3 | contact sheet; contact sheet (video) | image or video frames | ✅ done |
| creator-brand-batch | Brand kit on folder | creator | pipeline + team presets | M | 5 | brand kit batch; brand kit on folder | watermark, LUT, end slate, file names | open |

---

## Pack `media` — `packages/tools-media` (video core)

Simple filters are **not** separate tools. They hang off the core as presets (`video-convert`, `video-edit`, `audio-convert`, `audio-edit`). Implementation column then reads: `FFmpeg preset → <core>`.

### Video core tools

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| video-convert | Convert video | media | ffmpeg.wasm LGPL, mp4box.js, mp4-muxer, WebCodecs (H.264) | L | 3 | video converter (MP4, WEBM, MKV, MOV, AVI, FLV, OGV, 3GP, MPG, TS, WMV, GIF, VOB, ASF, RM, DIVX, F4V, MXF, OGM, DV, M2V, SVI, NUT, Y4M) | no x264/x265 in WASM. H.264 encode: WebCodecs where available, otherwise VP9/AV1/MPEG-4 soft. RM/WMV/MXF: best-effort decode | ✅ done |
| video-edit | Video filter core | media | ffmpeg.wasm filter graph | M | 3 | (preset carrier) | carrier of all `FFmpeg preset → video-edit` | ✅ done |
| video-compress | Compress video | media | ffmpeg.wasm, WebCodecs, binary search | M | 3 | compress | CRF/bitrate; couples `media-fit` | ✅ done |
| media-fit | Make it fit | media | binary search bitrate/resolution | L | 3 | make it fit (target size MB) | image in phase 2 via image-compress; video here | open |
| video-trim | Trim | media | ffmpeg.wasm, mp4box (keyframe) | S | 3 | trim | stream copy where possible | ✅ done |
| video-concat | Concatenate | media | ffmpeg.wasm | S | 3 | concatenate | re-encode if incompatible | open |
| video-split | Split | media | ffmpeg.wasm | S | 3 | split | time or scenes (scene detect optional) | ✅ done |
| video-replace-audio | Replace audio | media | ffmpeg.wasm, mp4box | S | 3 | replace audio | | ✅ done |
| video-watermark | Watermark (video) | media | ffmpeg.wasm overlay | M | 3 | watermark | | ✅ done |
| video-subtitles | Subtitles (without speech) | media | ffmpeg.wasm, own SRT/VTT parser | M | 3 | burn in; extract; convert; resync | speech/Whisper → speech-*. Soft-subs preset | open |
| video-to-gif | Video → GIF | media | ffmpeg.wasm, palette filter | M | 3 | video→GIF; GIF smart palette | preset `smart-palette` | ✅ done |
| gif-to-video | GIF → video | media | ffmpeg.wasm | S | 3 | GIF→video | | ✅ done |
| video-extract-audio | Audio from video | media | ffmpeg.wasm, mp4box | S | 3 | audio from video; extract all audio tracks (preset) | preset `all-tracks` | open |
| video-extract-frames | Stills from video | media | ffmpeg.wasm | S | 3 | stills; video→single frames | fps / time list | open |
| video-unpack | Unpack video | media | ffmpeg.wasm, mp4box | M | 3 | unpack video; remux (part) | streams as files | ✅ done |
| video-remux | Remux | media | mp4box, ffmpeg -c copy | S | 3 | remux | without re-encode | ✅ done |
| video-repair | Repair broken video | media | ffmpeg.wasm, mp4box | L | 3 | repair broken video | moov repair, index | ✅ done |
| video-screen-clean | Clean up screen recording | media | video-edit presets + crop | M | 3 | clean up screen recording | cursor jitter, letterbox, mono | open |
| video-restore | Restore old video | media | ffmpeg filters, optional showcase denoise | L | 3 | restore old video; brighten/denoise dark recording | presets: `brighten`, `denoise-light` — no miracle restore | ✅ done |
| video-chroma-key | Chroma key | media | ffmpeg colorkey/chromakey | M | 3 | chroma key | | ✅ done |
| video-screen-demo | Screen demo | media | cursor track optional, ffmpeg zoompan | XL | 5 | screen demo (click zoom, cursor, shortcuts, beep password field) | phase 5; beep = audio gate | open |
| video-proxy | Proxy for Premiere / Resolve | media | ffmpeg presets | M | 3 | proxy for Premiere/Resolve | ProRes not in LGPL WASM; DNxHR/OffSpeed/MP4 proxy | open |
| video-pip | PiP layout | media | ffmpeg overlay | M | 3 | PiP layout | | ✅ done |
| video-podcast | Podcast video | media | waveform + still + ffmpeg | M | 3 | podcast video | | open |
| video-before-after | Before/after slider | media | canvas + two videos / split screen | M | 3 | before/after slider | export: split or interactive WebM | open |
| video-stabilize | Stabilization | media | ffmpeg vidstab (if in LGPL build) otherwise own 2D | L | 3 | stabilization | document build flag | open |
| video-scene-detect | Scene detect | media | ffmpeg select/scenedetect | M | 3 | scene detect; detect black frames/freeze/clipping (preset) | presets: `cut`, `black`, `freeze`, `clip` | open |
| video-find-frame | Frame like reference | media | perceptual hash per frame | M | 3 | find frame like reference image | | open |
| video-intro-outro | Intro / outro / lower thirds | media | ffmpeg overlay, CSV | M | 3 | intro/outro/lower thirds from CSV; end slate/countdown | presets: `slate`, `countdown` | open |
| video-mkv-autopsy | MKV autopsy | media | mkv parser, forensics-autopsy | M | 3 | MKV autopsy | tracks, chapters, attachments | open |
| video-360 | Reframe 360 video | media | ffmpeg v360 | L | 5 | reframe 360 video | | open |
| video-hdr | HDR metadata / HDR→SDR | media | ffmpeg zscale/tonemap, mp4box | M | 3 | HDR→SDR; strip/add HDR metadata; color range flag fix | presets: `tonemap`, `strip`, `add`, `range-fix` | open |
| video-chapters | Chapters in MP4 | media | mp4box | S | 3 | chapters in MP4 | | ✅ done |
| video-cover-art | Cover art (video) | media | mp4box, ffmpeg | S | 3 | cover art | | open |
| video-audio-mix | Multichannel / dual audio | media | ffmpeg pan/amerge | M | 3 | 5.1→stereo/upmix; dual audio | presets: `51-stereo`, `upmix`, `dual` | open |
| video-loop | Seamless loop | media | ffmpeg | S | 3 | seamless loop | crossfade end | ✅ done |
| video-ad-draft | Audio description draft | media | speech-transcribe + LLM template | L | 4 | audio description draft | pack a11y uses the same tool | open |
| video-silence-cut | Remove silence (video) | media | ffmpeg silencedetect **or** Whisper VAD | M | 3 | remove silence | phase 3: level. Phase 4: Whisper VAD as an option | open |
| video-jumpcut | Jump-cut editor | media | speech-transcribe + cut list | L | 4 | jump-cut editor; Whisper→jump cut; filler word cutter | presets: `silence`, `filler`, `whisper` | open |
| video-auto-chapters | Auto chapters | media | Transformers.js / Whisper segments | L | 4 | auto chapters | | open |
| video-highlight | Highlight reel | media | energy + transcript keywords | L | 4 | highlight reel | | open |
| video-reframe | Talking-head smart reframe 9:16 | media | ONNX face/person, ffmpeg crop | L | 4 | talking-head smart reframe | | open |
| video-ocr-subs | Burned-in subtitles → SRT | media | Tesseract.js on frames | L | 4 | OCR on frames; burned-in subtitles via OCR→SRT | | open |
| video-lyric | Lyric video / karaoke | media | SRT timing + ffmpeg | L | 4 | lyric video; karaoke (video) | | open |
| video-audiogram | Audiogram | media | waveform + capsule still | M | 4 | audiogram | | open |
| video-meeting | Prepare meeting recording | media | scenes + transcript | L | 4 | meeting recording slide changes+chapters; split Zoom recording | presets: `slides`, `zoom-split` | open |
| video-meme-captions | Meme captions word by word | media | Whisper word timestamps, ffmpeg drawtext | M | 4 | meme captions word by word | | open |
| video-edl | EDL / markers from transcript | media | EDL/XML writer | M | 4 | EDL/markers from transcript | | open |
| video-swear-beep | Beep swear words | media | word list + Whisper + beep | M | 4 | beep swear words; profanity beep | a11y/parental control uses preset | open |
| video-sign-friendly | Sign-language friendly | media | crop/safe area, tempo | M | 4 | sign-language friendly | no avatar generator | open |
| video-epilepsy | Epilepsy check | media | flash frequency, area changes | M | 3 | epilepsy check | warning report, no "cure" | open |

### FFmpeg presets (video) — not separate tools

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| preset-video-mute | Mute | media | FFmpeg preset → video-edit | S | 3 | mute | `-an` / volume=0 | ✅ as `video-mute` |
| preset-video-scale | Scale | media | FFmpeg preset → video-edit | S | 3 | scale | scale= | ✅ preset in `video-edit` |
| preset-video-crop | Crop | media | FFmpeg preset → video-edit | S | 3 | crop; crop letterbox; letterbox vs. crop | presets: `manual`, `letterbox-detect` | ✅ as `video-crop` |
| preset-video-reverse | Reverse | media | FFmpeg preset → video-edit | S | 3 | reverse | | ✅ as `video-reverse` |
| preset-video-boomerang | Boomerang | media | FFmpeg preset → video-edit | S | 3 | boomerang | reverse+concat | ✅ as `video-boomerang` |
| preset-video-speed | Speed | media | FFmpeg preset → video-edit | S | 3 | speed; frame-rate change without chipmunk effect | `setpts` + `atempo`; chain for large factors | ✅ as `video-speed` |
| preset-video-brighten | Brighten | media | FFmpeg preset → video-edit | S | 3 | brighten dark recording | eq/curves | ✅ preset in `video-edit` |
| preset-video-denoise-hq | Denoise (filter) | media | FFmpeg preset → video-edit | S | 3 | denoise | hqdn3d/nlmeans if in build | ✅ preset in `video-edit` |
| preset-video-vfr-cfr | VFR → CFR | media | FFmpeg preset → video-convert | S | 3 | VFR→CFR | fps= | ✅ preset in `video-convert` |
| preset-video-rotation | Rotation flag vs. pixels | media | FFmpeg preset → video-convert | S | 3 | rotation flag vs. pixels | transpose vs. metadata | ✅ preset in `video-convert` |
| preset-video-fps | Set frame rate | media | FFmpeg preset → video-convert | S | 3 | frame-rate change | | ✅ as `video-fps` |
| preset-video-gif-palette | GIF palette | media | FFmpeg preset → video-to-gif | S | 3 | GIF smart palette | palettegen/paletteuse | ✅ preset in `video-to-gif` |

---

## Pack `media` — audio core

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| audio-convert | Convert audio | media | ffmpeg.wasm LGPL | L | 3 | audio converter (MP3, WAV, M4A, OGG, OPUS, FLAC, AIFF, WMA, AC3, AMR, APE, MPC, RA, TTA, WV, AU, CAF, GSM, DTS, MKA) | bind encode set to LGPL build; WMA/APE/DTS decode best-effort | ✅ done |
| audio-edit | Audio filter core | media | ffmpeg.wasm filter graph | M | 3 | (preset carrier) | carrier of the audio FFmpeg presets | ✅ done |
| audio-normalize | Normalize loudness | media | ffmpeg loudnorm | M | 3 | normalize loudness; album normalization; ReplayGain | presets: `ebu-r128`, `album`, `replaygain` | ✅ done |
| audio-join | Join | media | ffmpeg concat | S | 3 | join; gapless join | preset `gapless` | ✅ done |
| audio-trim | Trim | media | ffmpeg | S | 3 | trim | | ✅ done |
| audio-split | Split | media | ffmpeg | S | 3 | split; CUE split (preset) | preset `cue` → audio-cue | ✅ done |
| audio-silence-remove | Remove silence | media | silencedetect | M | 3 | remove silence | | open |
| audio-stems | Vocals / backing / stems | media | ONNX (Demucs-like) locally, WebGPU | XL | 4 | separate vocals/backing; stems | large model; Cache Storage | ✅ done |
| audio-key | Key | media | analysis (essentia WASM or own) | M | 3 | key | | open |
| audio-anonymize | Anonymize voice | media | ffmpeg + pitch/formant, optional vocoder | L | 3 | anonymize voice | no "irreversible" claim | open |
| audio-interview | Interview on two tracks | media | ffmpeg channelsplit / dual mono | M | 3 | interview on two tracks | | open |
| audio-ebu-report | EBU R128 report | media | ffmpeg loudnorm print | M | 3 | EBU R128 report | measurement only | open |
| audio-cleanup | De-esser / plosives / breath gate | media | ffmpeg + own filters | M | 3 | de-esser/plosives/breath gate | one tool, three presets | open |
| audio-cough | Cough cutter + room tone | media | local classifier or peak+spectrum | L | 4 | cough cutter+room tone | room tone from gaps | open |
| audio-roomtone | Loop room tone | media | loop finder | S | 3 | loop room tone | | open |
| audio-audiobook | Audiobook chapters | media | silence + chapter UI | M | 3 | audiobook chapters | | open |
| audio-chopper | Sample chopper | media | WebAudio | M | 3 | sample chopper | | open |
| audio-loop-find | Loop point finder | media | autocorrelation | M | 3 | loop point finder | | open |
| audio-bpm | BPM / downbeat | media | analysis | M | 3 | BPM/downbeat | | open |
| audio-practice | Practice player | media | WebAudio | M | 3 | practice player | tempo without key shift, loop, cue | open |
| audio-vinyl | Restore vinyl / cassette | media | ffmpeg + click removal | L | 3 | vinyl/cassette restoration | | open |
| audio-target-eq | Target EQ | media | EQ presets | M | 3 | target EQ (phone/radio/club) | | open |
| audio-ducking | Ducking | media | sidechain / WebAudio | M | 3 | ducking (7.8 + 7.15) | | ✅ done |
| audio-fingerprint | Local fingerprint | media | Chromaprint WASM or own | L | 5 | local fingerprint | local only, no AcousticID cloud | open |
| audio-click-track | Click track / tuning tone | media | oscillator | S | 3 | click track/tuning tone | | ✅ done |
| audio-waveform-poster | Waveform poster | media | canvas | S | 3 | waveform poster | | ✅ done |
| audio-spectrogram | Spectrogram | media | FFT, canvas | S | 3 | spectrogram | | ✅ done |
| audio-ringtone | Ringtone / M4R | media | audio-convert preset | S | 3 | ringtone/M4R | AAC + length | ✅ done |
| audio-limiter | True-peak limiter / DC offset | media | ffmpeg alimiter, dcshift | S | 3 | true-peak limiter/DC offset | | open |
| audio-cue | CUE split | media | CUE parser + ffmpeg | S | 3 | CUE split | | open |
| audio-id3 | Cover art / ID3 | media | ID3 writer | S | 3 | cover art ID3 | | open |
| audio-tempo-match | Match speaker tempo | media | Whisper segments + atempo | L | 4 | match speaker tempo | | open |
| audio-spatial | Spatial flatten / remove center | media | ffmpeg pan | M | 3 | spatial flatten; remove center channel | presets: `flatten`, `no-center` | open |
| audio-resample | Sample rate / bit depth / dither | media | ffmpeg | S | 3 | sample rate/bit depth dither | | open |
| audio-playlist-xfade | Playlist crossfade | media | ffmpeg acrossfade | M | 3 | playlist crossfade | | open |
| audio-voice-note | WhatsApp voice note | media | audio-convert preset (OGG/OPUS) | S | 3 | WhatsApp voice note | | open |
| audio-voice-memos | Apple Voice Memos | media | M4A + chapters | S | 3 | Apple Voice Memos | | open |
| audio-diarize | Diarization / extract speakers | media | Transformers.js | L | 4 | diarization extract speakers | | open |
| audio-podcast-factory | Podcast factory | media | pipeline: normalize, ducking, silence, ID3 | L | 4 | podcast factory | | open |
| audio-karaoke | Karaoke (audio) | media | stems + lyrics timing | L | 4 | karaoke | | open |

### FFmpeg presets (audio)

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| preset-audio-stereo-mono | Stereo → mono | media | FFmpeg preset → audio-edit | S | 3 | stereo→mono | | ✅ preset in `audio-edit` |
| preset-audio-volume | Volume | media | FFmpeg preset → audio-edit | S | 3 | volume | | ✅ as `audio-volume` |
| preset-audio-fade | Fade | media | FFmpeg preset → audio-edit | S | 3 | fade | | ✅ as `audio-fade` |
| preset-audio-midside | Mid/side | media | FFmpeg preset → audio-edit | S | 3 | mid/side | | ✅ preset in `audio-edit` |
| preset-audio-replaygain | ReplayGain | media | FFmpeg preset → audio-normalize | S | 3 | ReplayGain | | ✅ as `audio-replaygain` |
| preset-audio-gapless | Gapless join | media | FFmpeg preset → audio-join | S | 3 | gapless join | | ✅ preset in `audio-join` |

---

## Pack `speech` — `packages/tools-speech`

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| speech-transcribe | Transcribe (Whisper) | speech | Transformers.js v3, ONNX Runtime Web, WebGPU | XL | 4 | Whisper tiny.en; multilingual; larger models; subtitles+text+speaker separation | options: model size, language, word timestamps, diarization flag | ✅ done |
| speech-subtitle-edit | Shift / snap subtitles | speech | SRT/VTT parser | M | 4 | shift; snap to gaps | | open |
| speech-bilingual | Bilingual SRT | speech | speech-translate + merge | M | 4 | bilingual SRT | | open |
| speech-translate | Translate locally | speech | Marian/NLLB via Transformers.js | L | 4 | translate locally (Marian/NLLB) | self-host models | open |
| speech-ocr-frames | OCR on frames | speech | Tesseract.js | L | 4 | OCR on frames | alias/API of video-ocr-subs | open |
| speech-jumpcut | Whisper → jump cut | speech | speech-transcribe + cut list | L | 4 | Whisper→jump cut | delegates to video-jumpcut | open |
| speech-chat-doc | Chat with PDF / summary | speech | WebLLM, pdfjs-dist, chunking | XL | 4 | local LLM; chat with PDF; summary | local models only; no server LLM | open |
| speech-meeting-notes | Meeting notes | speech | Whisper + WebLLM | L | 4 | meeting notes Whisper+LLM | action items, chapters | open |
| speech-tts | TTS (Kokoro) | speech | kokoro-js | L | 4 | (infrastructure for a11y/lyric) | no cloud TTS | open |

---

## Pack `office` — `packages/tools-office`

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| office-docx | DOCX ↔ Markdown/HTML/TXT | office | mammoth, docx | M | 4 | DOCX↔Markdown/HTML/TXT | | open |
| office-xlsx | XLSX ↔ CSV/JSON | office | SheetJS Community **only** | M | 4 | XLSX↔CSV/JSON | no SheetJS Pro | open |
| office-pptx | PPTX → images/PDF | office | JSZip, pdf-lib, raster | M | 4 | PPTX→images/PDF | layout best-effort | open |
| office-markdown | Markdown → PDF/HTML | office | Markdown parser, html-to-pdf | M | 4 | Markdown→PDF/HTML | | open |
| office-html-pdf | HTML → PDF | office | browser print / own layout | M | 4 | HTML→PDF | no headless Chrome requirement in WASM; desktop may use the WebView | open |
| office-epub | Open up EPUB | office | JSZip, EPUB parser | L | 4 | open up EPUB/images/fonts/↔PDF/→HTML | presets: `unpack`, `images`, `fonts`, `to-html`, `to-pdf` | open |
| office-vcard | Business card → vCard | office | Tesseract, parser | M | 4 | business card→vCard | | open |
| office-vcard-merge | Merge vCards | office | vCard parser | S | 4 | merge vCards | | open |
| office-ics-merge | Merge ICS | office | ics parser | S | 4 | merge ICS | | open |
| office-data-clean | Clean up CSV/JSON/YAML/XML | office | parser, schema | M | 4 | clean up CSV/JSON/YAML/XML | encoding, delimiter, trim | open |
| office-font-subset | Font subset → WOFF2 | office | harfbuzz WASM / woff2 | L | 4 | font subset→WOFF2 | | open |
| office-handwriting | Handwriting → text | office | Tesseract.js / optional CRNN | L | 4 | handwriting→text | overlaps image-doc-repair preset `notiz-ocr` | open |
| office-qr | Read & generate QR / barcode | office | zxing-wasm | S | 4 | read/generate QR/barcode | | open |
| office-signature-cutout | Cut out signature | office | threshold + trim | S | 4 | cut out signature | | open |
| office-anki | Anki card | office | APKG/CSV | M | 4 | Anki card | | open |

---

## Pack `archive` — `packages/tools-archive`

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| archive-create | Create archive | archive | JSZip, fflate, 7z-wasm / libarchive.js | M | 2 | create ZIP/7z/TAR | | ✅ done |
| archive-extract | Extract archive | archive | JSZip, libarchive.js / 7z-wasm | M | 2 | extract ZIP/7z/TAR; pull single files | preset `pull-selected` | ✅ done |
| archive-inspect | View contents | archive | same parsers | S | 2 | view contents | without full extraction | ✅ done |
| archive-check | Check broken archives | archive | CRC, list attempt | M | 2 | check broken archives | | open |
| archive-convert | Convert archive formats | archive | extract+create | M | 2 | convert archive formats | | ✅ done |
| archive-camera-dump | Unfold camera dump | archive | EXIF, DCIM rules | M | 2 | unfold camera dump | | open |
| archive-rename-date | Rename by date | archive | EXIF/mtime | S | 2 | rename by date | | open |
| archive-dupes | Duplicates | archive | SHA-256, dHash | M | 2 | duplicates hash/perceptual | | open |
| archive-space | Space hogs / space radar | archive | size tree | M | 2 | space hogs; space radar | | open |
| archive-sidecar | Sidecar wrangler | archive | naming rules | M | 2 | sidecar wrangler; sidecar pairs JPG+RAW+XMP | RAW files are only **matched**, not developed | open |
| archive-manifest | SHA-256 manifest | archive | WebCrypto, JSON/SFV | S | 2 | SHA-256 manifest | folder | open |
| archive-folder-diff | Compare folders | archive | hash trees | M | 2 | compare folders | | open |
| archive-checksum | Checksums | archive | SHA/MD5/CRC | S | 2 | checksums | | open |

---

## Pack `a11y` — lives in `pdf` / `image` / `media` / `speech`, manifest flag `pack: a11y`

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| a11y-alt-text | Alt text locally, batch | a11y | Transformers.js caption, WebLLM | L | 4 | alt text locally batch | local only | open |
| a11y-easy-read | Easy-read image | a11y | caption + simplification | L | 5 | easy-read image | | ✅ done |
| a11y-captions-slow | Captions slower without overlay | a11y | ffmpeg tempo + soft subs | M | 4 | captions+slower without overlay | | open |
| a11y-colorblind | (alias) Color-blindness simulator | a11y | image-colorblind | S | 2 | color-blindness simulator | no second binary | open |
| a11y-swear | (alias) Profanity beep | a11y | video-swear-beep | S | 4 | profanity beep | | open |
| a11y-audio-desc | (alias) Audio description | a11y | video-ad-draft | S | 4 | audio description draft | | open |
| a11y-epilepsy | (alias) Epilepsy check | a11y | video-epilepsy | S | 3 | epilepsy check | | open |
| a11y-kids-subs | Parental control via subtitles | a11y | word list + soft subs | M | 5 | parental control via subtitles | community-adjacent; in phase 5 | open |

`pdf-ua` stays in the `pdf` pack and is listed on the a11y hub page.

---

## Pack `platform` — engine / apps (no media runtime)

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| platform-pipeline | Cross-media pipeline builder | platform | engine pipeline, URL hash | L | 1 | chain tools; pipeline builder; shareable links | config serializable; share only the hash, no file | open |
| platform-folder-convert | Convert folder | platform | File System Access, directory tree | M | 2 | convert folder with directory tree; everything in a folder to target format | | open |
| platform-error-journal | Error protocol | platform | engine error log, JSON export | S | 1 | error protocol | per file: code, stack, input hash | open |
| platform-format-kb | Format knowledge base | platform | JSON/YAML KB → `/formats/`, `/convert/a-to-b`, `/spec/` | L | 1 | format knowledge base; SEO data source | feeds spec check and presets | open |
| platform-watch | Folder watch | platform | FSA + CLI `chokidar` | M | 2 | watch folder; CLI watch folder; folder watch (File System Access) | two adapters, one tool job | open |
| platform-opfs-history | OPFS history + undo | platform | OPFS, IndexedDB metadata | M | 2 | OPFS history with undo | | open |
| platform-pwa | PWA handlers | platform | Web App Manifest | M | 1 | file_handlers; share_target; shortcuts | | open |
| platform-cli | CLI | platform | Node, Commander/Yargs, same registry | M | 1 | apps/cli | `run`, `pipeline`, `watch` | open |
| platform-docker | Docker / white-label | platform | nginx, branding.json, optional API | L | 1 | self-hosting; white-label | | open |
| platform-desktop | Tauri scaffolding + PDF file association | platform | Tauri 2 | L | 1 | desktop app; .pdf file association | reader mode = WP, see roadmap | open |
| platform-desktop-reader | Desktop PDF reader mode | platform | pdfjs-dist, Tauri fs | XL | 1 | display, search, comments, forms, signature, redaction, save | phase 1 cut: display+search+save+redaction. Comments phase 4 | open |
| platform-rest-api | REST API sidecar | platform | Node, same engine | L | 4 | REST API in self-hosting | self-host only; no public SaaS obligation | open |
| platform-fulltext | Full-text search across a case file | platform | OPFS + SQLite WASM / FlexSearch | L | 4 | local full-text search | | open |
| platform-audit-log | Local audit log | platform | append-only IDB | M | 4 | local audit log | no telemetry channel | open |
| platform-extension | Browser extension | platform | MV3, shares engine where possible | L | 5 | browser extension | | open |
| platform-benchmark | Benchmark page | platform | Vitest-like harness in the browser | M | 5 | benchmark page | WASM/worker/WebGPU | open |
| platform-stream-opfs | Video streaming via OPFS | platform | chunked ffmpeg, OPFS | L | 3 | streaming via OPFS for large videos | mandatory for >~1 GB | open |
| platform-webllm | WebLLM runtime | platform | WebLLM, Cache Storage | L | 4 | local LLM | used by speech-chat-doc | open |

---

## Pack `community` — phase 5+, own plugins

| ID | Title | Pack | Implementation | Effort | Phase | Merged from | Note | Status |
|---|---|---|---|---|---|---|---|---|
| community-gltf | 3D lite glTF/OBJ/GLB | community | three.js lazy | L | 5 | 3D lite glTF/OBJ/GLB | plugin | open |
| community-ktx | KTX / Basis | community | basis transcoder self-hosted | M | 5 | KTX/Basis | plugin | open |
| community-count | Object / people count | community | ONNX | L | 5 | object/people count | no surveillance pitch; opt-in plugin | open |
| community-exotic | Exotic formats | community | per codec | XL | 5 | PSD; EXR; DDS; XWD; JPEG 2000; RAW workshop | **only after usage data.** Developing RAW ≠ matching sidecars | open |
| community-games | Game assets | community | parsers | L | 5 | game assets | without ROM header editor (dropped) | open |

---

## Deliberately omitted

Not in the product. No IDs, no SEO pages, no CLI commands. Community plugin only from phase 5 and only after legal/product approval.

| Source idea | Reason |
|---|---|
| Remove watermark via inpainting | legally sensitive (copyright, evidence). **Detection** stays (`forensics-watermark-find`) |
| Remove logo in corners | same inpainting class |
| Remove object / content-aware fill | abuse (evidence photos), high model effort |
| CLIP interrogator | prompt reverse, little DACH benefit, model license/size |
| Save-game / ROM header | circumvention of copy protection / game-asset legal issues |
| Rectify weather radar | niche geo, own projection systems |
| Depth from single image | unreliable, showcase trap; **extracting** HEIC depth stays |
| Frame interpolation / slow-mo interpolation | quality vs. size; chipmunk-free tempo change stays as an FFmpeg preset |
| Anamorphic (de-squeeze as a product) | niche; community |
| Log→Rec.709 as a separate tone mapper | only LUT preset `log-rec709` on `image-lut` / `video-hdr` |
| Skin smoothing | beauty filter, no USP, ethically undesirable |
| Lo-fi version | gimmick; ducking/EQ stay |
| Multi-cam sync | editor suite, not a browser tool |
| Focus stack | microscope/macro niche |
| Exposure blend / HDR bracketing | niche; HDR↔SDR tonemap stays |
| Star trail | astro niche |
| Panorama stitch | hard, patent-/quality-heavy |
| PSD / EXR / DDS / XWD / JPEG 2000 / RAW workshop as core | → `community-exotic`, phase 5, only after usage data. Super-resolution and denoise are **not** dropped but **one** showcase each (phase 5) |
| Average out people in timelapses | inpainting/median stack, privacy-sensitive |
| AGPL libraries (Ghostscript, MuPDF, iText) | license ban, regardless of the feature idea |

---

## Merges (overview)

| Target | Number of sources | Sources |
|---|---|---|
| image-doc-repair | 7 | document scanner, whiteboard photo, perspective correction, brighten child's drawing, moiré, handwritten note, whiteboard→PNG+OCR |
| creator-export-pack | 16 | favicon pack, Apple touch, app icon set, maskable icons, OG card, OG/social card, web pack, print pack, social pack, platform pack, brand kit export, product photo pack, favicon set 7.3, safe zones, size caps, spec sizes |
| image-screenshot-studio | 8 | washer, clipboard sanitizer, leak check, device mockup, app store frame, long screenshot, screenshot vs. photo, ID card screenshot warning |
| image-convert | 16 | JPG, PNG, WEBP, AVIF, GIF, BMP, TIFF, ICO, HEIC, SVG, TGA, PPM, PGM, PBM, APNG, JXL (+ HEIC→JPG, TIFF r/w as presets) |
| video-convert | 25 | all listed video containers as formats of one tool |
| audio-convert | 21 | all listed audio formats as formats of one tool |
| image-metadata | 2 | strip + read/edit |
| image-exif-batch | 3 | TZ, rename, sort |
| image-compress | 2 | compress + visually lossless |
| pdf-redact | 5 | redact, click, auto patterns, NER, verification |
| pdf-compare | 2 | PDF compare, contract compare |
| pdf-sign | 2 | sign, PAdES/PKCS#12 |
| video-subtitles | 4 | burn, extract, convert, resync |
| audio-stems | 2 | vocal split, stems |
| audio-cleanup | 3 | de-esser, plosives, breath gate |
| audio-normalize | 3 | loudness, album, ReplayGain |
| image-livephoto | 2 | split, Live↔Motion |
| image-spritesheet | 3 | sheet, atlas, pack/unpack |
| image-lut | 2 | LUT/film look + Log→Rec.709 preset |
| video-hdr | 3 | tonemap, meta strip/add, range fix |
| video-scene-detect | 4 | scene, black, freeze, clipping |
| video-jumpcut | 3 | jump cut, filler words, Whisper cut |
| video-meeting | 2 | slides+chapters, Zoom split |
| video-audio-mix | 3 | 5.1, upmix, dual |
| platform-watch | 3 | watch folder, CLI watch, FSA watch |
| platform-folder-convert | 2 | convert tree, folder to target format |
| forensics-share-safe | 2 | "safe to share?", share pack |
| speech-transcribe | 4 | tiny.en, multilingual, large models, speaker flag |
| office-epub | 5 | unpack, images, fonts, ↔PDF, →HTML |
| archive-extract | 2 | extract, single files |
| archive-space | 2 | space hogs, space radar |
| archive-sidecar | 2 | wrangler, JPG+RAW+XMP |
| image-to-animation | 2 | GIF/video/slideshow, timelapse series |
| media FFmpeg presets | 18 | mute, scale, crop/letterbox, reverse, boomerang, speed, brighten, denoise filter, vfr-cfr, rotation, fps, gif palette, stereo-mono, volume, fade, mid/side, replaygain, gapless |

**Source ideas in merges:** 7+16+8+16+25+21+2+3+2+5+2+2+4+2+3+3+2+3+2+3+4+3+2+3+3+2+2+4+5+2+2+2+2+18 = **185** (formats in converter cores included).

**Merge groups:** 34.

---

## Counters

Rules: alias tools (`a11y-colorblind`, `a11y-swear`, `a11y-audio-desc`, `a11y-epilepsy`) do **not** count. FFmpeg presets do **not** count as tools. Community plugins separately.

### Tools per pack

| Pack | Tools | FFmpeg presets | Aliases |
|---|---|---|---|
| pdf | 20 | — | — |
| dach | 14 | — | — |
| forensics | 17 | — | — |
| image | 51 | — | — |
| creator | 6 | — | — |
| media | 91 | 18 | — |
| speech | 9 | — | — |
| office | 15 | — | — |
| archive | 13 | — | — |
| a11y (real, no aliases) | 4 | — | 4 |
| platform | 18 | — | — |
| **Total excluding community** | **258** | **18** | **4** |
| community | 5 | — | — |
| **Total incl. community** | **263** | **18** | **4** |

`media` 91 = video core 51 + audio core 40 (IDs `video-*` / `gif-to-video` / `media-fit` vs. `audio-*`).

### Tools per phase

| Phase | Tools | incl. community | Focus |
|---|---|---|---|
| 1 | 38 | 38 | engine surfaces, PDF (17), privacy/forensics basics (11), DACH minimum (2), platform (8) |
| 2 | 69 | 69 | image (45), archive (13), creator core (3), forensics deepening (5), platform (3) |
| 3 | 76 | 76 | FFmpeg video/audio + dependent image/creator tools, OPFS streaming |
| 4 | 64 | 64 | Whisper/WebGPU, office, DACH deepening, WebLLM, a11y core |
| 5 | 11 | 16 | AI showcases, creator batch, extension, benchmark, community (5) |
| **Total** | **258** | **263** | |

Phase assignment = column *Phase* in the pack tables.

### Dropped / merged

| Size | Number |
|---|---|
| Dropped for good (user list) | **22** (16 features + 6 exotic formats: PSD, EXR, DDS, XWD, JPEG 2000, RAW workshop) |
| Dropped by analogy (same class) | **2** (logo inpaint, averaging out people in timelapses) |
| License ban (not a feature) | AGPL libraries |
| Merge groups | **34** |
| Source ideas in these groups | **185** (converter formats included) |
| Super-resolution / denoise | not dropped; **one** showcase each, phase 5 |

## State after wave 5 (2026-09-14)

The **Status** column is derived from the registry (`node apps/cli/dist/cli.js list --json`, 235 tools): `✅ done` = ID registered, `✅ as …` = preset implemented as a standalone tool, `✅ preset in …` = core tool registered, `open` = not implemented or under another ID (see below).

| Status | Rows |
|---|---|
| ✅ done | 103 |
| ✅ as a separate tool | 9 |
| ✅ preset in core | 9 |
| open | 164 |

### Registered tools without their own backlog row

These IDs are implemented and registered in web/CLI/API; they arose from merges, format edges (`docx-to-pdf` instead of a converter summary row) or wave 5 additions.

- **a11y** (3): `image-alt-text`, `a11y-sign-friendly`, `a11y-audio-description-draft`
- **archive** (7): `archive-extract-selected`, `archive-test`, `files-camera-dump`, `files-duplicates`, `files-space-radar`, `files-compare-folders`, `files-checksum`
- **creator** (19): `creator-platform-pack`, `creator-thumbnail-factory`, `creator-brand-kit`, `creator-audiogram`, `creator-lyric-video`, `creator-karaoke`, `creator-meme-captions`, `creator-before-after`, `creator-podcast-video`, `creator-intro-outro`, `creator-meme-ratios`, `creator-cinemagraph`, `creator-collage`, `creator-timelapse`, `creator-movie-barcode`, `creator-storyboard-pdf`, `creator-social-card`, `creator-device-mockup`, `creator-sprite-sheet`
- **image** (18): `image-remove-background`, `image-screenshot-workshop`, `image-upscale`, `image-duplicates`, `image-passport`, `image-live-photo`, `image-red-eye`, `image-line-art`, `image-pixel-art`, `image-to-svg`, `image-seamless-texture`, `image-normal-map`, `image-geotag-export`, `image-sort-by-date`, `image-burst-best`, `image-color-transfer`, `image-hidden-layer-check`, `image-film-scan`
- **media** (30): `video-cutlist`, `video-resize`, `video-join`, `video-subtitles-burn`, `video-subtitles-extract`, `video-to-frames`, `video-contact-sheet`, `video-brighten-denoise`, `video-flags`, `video-hdr-to-sdr`, `video-detect`, `video-audio-tracks`, `video-thumbnails`, `video-highlight-reel`, `video-smart-reframe`, `video-360-reframe`, `audio-mono`, `audio-remove-silence`, `audio-bleep`, `audio-eq-presets`, `audio-limiter-dc`, `audio-dither`, `audio-crossfade-playlist`, `audio-mid-side`, `audio-center-remove`, `audio-cover-art`, `audio-voice-notes`, `audio-key-bpm`, `audio-anonymize-voice`, `audio-spatial-flatten`
- **office** (32): `docx-to-pdf`, `docx-to-markdown`, `docx-to-html`, `docx-to-txt`, `markdown-to-docx`, `html-to-docx`, `markdown-to-pdf`, `markdown-to-html`, `html-to-pdf`, `text-to-pdf`, `xlsx-to-csv`, `csv-to-xlsx`, `xlsx-to-json`, `json-to-xlsx`, `xlsx-to-pdf`, `csv-to-pdf`, `pptx-to-pdf`, `pptx-to-images`, `pptx-to-text`, `epub-to-pdf`, `epub-to-html`, `epub-unpack`, `epub-extract-images`, `epub-fix-fonts`, `epub-from-markdown`, `pdf-to-epub`, `data-clean`, `vcard-tools`, `ics-merge`, `font-subset`, `qr-batch`, `anki-from-images`
- **pdf** (4): `pdf-page-numbers`, `pdf-metadata`, `pdf-extract-text`, `pdf-repair`
- **speech** (10): `subtitles-convert`, `subtitles-shift`, `subtitles-snap`, `subtitles-translate`, `subtitles-bilingual`, `transcript-edits`, `transcript-chapters`, `transcript-summary`, `subtitles-ocr`, `audio-profanity-bleep-list`

### Open after wave 5

- `audio-stems` registered but hidden (no license-clean compact model).
- Community plugin loader (`packages/plugins/3d-lite` is an example pack without a runtime loader).
- AI showcases (`image-upscale`, `image-denoise`) remain showcases without a quality promise.
- Exotic formats (`community-exotic`) not started.
- All rows marked `open` above.
