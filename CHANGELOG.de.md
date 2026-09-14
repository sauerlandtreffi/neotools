🇩🇪 Deutsch · [🇬🇧 English](./CHANGELOG.md)

# Changelog

Alle nennenswerten Änderungen an NeoTools werden in dieser Datei dokumentiert.

Das Format folgt [Keep a Changelog 1.1](https://keepachangelog.com/de/1.1.0/), die Versionierung
[Semantic Versioning](https://semver.org/lang/de/). Bis zum ersten Tag `v*` werden die Abschnitte nach
Entwicklungs-Wellen geführt (Commit-Hashes in Klammern, Branch `main`).

## [Unreleased]

- Dokumentation ist jetzt englisch-first; deutsche Fassungen liegen als `*.de.md` daneben.
- `/app`-Arbeitsbereich (Dropzone, Verlauf, Pipeline-Builder in einer Ansicht) in Arbeit.
- Verweise auf frühere Referenzseiten und die zugehörige Vergleichsseite entfernt.

## [Welle 5] - 2026-09-14

Launch-Vorbereitung (Commits `fix(security)`, `feat(creator)`, `feat(media): lgpl ffmpeg`, `docs(launch)`, `chore: wave 5 wiring` — Hashes siehe `git log`). Adversarial Security-Review mit Fix-Mandat, Creator-Pack,
neue Bild-/Media-Tools, eigener LGPL-FFmpeg-Build, Launch-Seiten, Guides.

### Added

- **Creator-Pack** `packages/tools-creator` (23 Tools): Platform-Pack, Spec-Check, Thumbnail-Factory,
  Contact-Sheet, Brand-Kit, Audiogram, Lyric-Video, Karaoke, Meme-Captions, Meme-Ratios, Before/After,
  Podcast-Video, Intro/Outro, Sticker-Set, Cinemagraph, Collage, Timelapse, Movie-Barcode, Storyboard-PDF,
  Social-Card, Device-Mockup, Sprite-Sheet u. a.; baut auf `tools-image` und `tools-media` auf.
- **Bild-Tools** (`image` jetzt 40): `image-burst-best`, `image-color-transfer`, `image-film-scan`,
  `image-geotag-export`, `image-hdr-tonemap`, `image-hidden-layer-check`, `image-icc`, `image-line-art`,
  `image-live-photo`, `image-lut`, `image-normal-map`, `image-passport`, `image-pixel-art`, `image-red-eye`,
  `image-scopes`, `image-seamless-texture`, `image-sort-by-date`, `image-to-svg` (eigener Konturtracer, MIT).
- **Media-Tools** (`media` jetzt 68): `audio-click-track`, `audio-spatial-flatten`, `video-360-reframe`,
  `video-chroma-key`, `video-highlight-reel`, `video-smart-reframe`.
- **A11y-Tools** in `tools-image-ai`: `a11y-easy-read`, `a11y-sign-friendly` (Pack `a11y`, 4 Tools).
- **Community-Plugin-Beispiel** `packages/plugins/3d-lite` (`manifest.json`, `neotoolsPlugin` in
  `package.json`, Caps-Sandbox, Lizenzliste; `gltf-inspect`-Stub, nicht im Kern registriert).
- **LGPL-FFmpeg-Core, eigener Build:** `packages/tools-media/Dockerfile.ffmpeg-lgpl`,
  `packages/tools-media/scripts/build-ffmpeg-lgpl.sh`, Workflow `.github/workflows/ffmpeg-lgpl.yml`
  (Artefakt + Release `ffmpeg-lgpl`), `scripts/fetch-ffmpeg-lgpl.mjs`. Artefakt liegt gitignored unter
  `packages/tools-media/vendor/ffmpeg-lgpl/`. Loader bevorzugt den LGPL-Core, Fallback GPL-Core aus
  `@ffmpeg/core` mit dynamischer Kennzeichnung auf `/lizenzen` (`getFfmpegCoreFlavor()`).
- **Launch-Seiten:** `/preise` · `/en/pricing`, `/vergleich/{ilovepdf,smallpdf,adobe-acrobat}` ·
  `/en/compare/*`, `/ueber` · `/en/about`, `/impressum` · `/datenschutz` (Vorlagen aus `branding.json`
  `legal.*`, `hosting.*`, `desktop.*`; leere Felder bleiben sichtbare Platzhalter).
- **Guides:** 24 Anleitungen de + en unter `apps/web/src/content/guides/` (`/guides/[slug]`, `/en/guides/*`).
- `scripts/check-i18n.mjs`: bricht ab, wenn de/en-Dictionary-Schlüssel oder `categoryLabels` divergieren.
- `branding.json`: neue Blöcke `legal`, `pricing`, `contact`, `hosting`, `desktop`, `footerLinks`,
  `showPoweredBy`.
- Neue Tests: `pdf-redact-adversarial`, `pdf-sanitize-adversarial`, License-Tamper-Tests, API-Job-Isolation,
  Archive-Pfadangriffe, `apps/web/test/security-wave5.test.ts`, Playwright `network-whitelist.spec.ts`
  (alle dist-Seiten + 10 % `formats`/`convert`, Fremd-Origins brechen ab), `wave5.spec.ts` (Launch-Seiten,
  Creator-Lauf, Redact-Angriffsfall Form-XObject), LGPL-Core-Test `packages/tools-media/test/lgpl-core.test.ts`
  (VP9/Opus/MP3/AAC/loudnorm/Untertitel/GIF), Rust-Tests `valid_deep_link`.
- `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/PLUGINS.md`, `docs/BRANDING.md`,
  Release-Workflow `.github/workflows/release.yml` (Tag `v*`: Build/Test/Typecheck/Lint, Web-Dist- und
  CLI-Tarball, optionaler LGPL-FFmpeg-Core aus dem `ffmpeg-lgpl`-Release, GitHub-Release mit CHANGELOG-Auszug).
- `docs/BACKLOG.md`: Spalte **Status** (aus der Registry abgeleitet) + Abschnitt „Stand nach Welle 5“.

### Changed

- FFmpeg-Lizenzeintrag ist jetzt dynamisch (`MEDIA_LICENSES` / `refreshMediaLicenses()`), abhängig vom
  geladenen Core.
- `pdf-redact` schreibt Dokumente komplett neu (`savePdfRewritten`, keine Objekt-Streams, kein
  inkrementelles Update); Verify prüft Text, Rohbytes und ToUnicode fail-closed.
- Verify-Reports tragen `warnings[]` und `advisory`-Checks; die UI zeigt kein stilles Grün mehr.
- Service Worker cached nur Precache, `/_astro` und `/assets` (kein Cache-all GET).
- `docs/ROADMAP.md`: „Stand nach Welle 5“ + „Offen nach Welle 5“; `README.md`/`docs/ARCHITECTURE.md` auf
  Launch-Stand (235 Tools, 10 Packs).
- Lizenz-Manifeste: `@ffmpeg/util` und `@ffmpeg/core-mt` ergänzt; `/lizenzen` erklärt den FFmpeg-Core je nach
  geladenem Flavor (LGPL eigener Build vs. GPL temporär).
- LGPL-Core-Link mit `-sSTACK_SIZE=5MB`: der 64-KB-Default von emsdk ≥ 3.1.27 lässt den libvpx-VP9-Encoder
  mit „memory access out of bounds“ abstürzen (reproduzierbar auch mit dem offiziellen `@ffmpeg/core` 0.12.10).
- `/en/preise`, `/en/ueber`, `/en/vergleich/*` Redirect-Stubs entfernt (Locale-Switch kennt die Zielpfade).

### Fixed

- `assessExtension` erkennt Dateitypen unabhängig von der Endung (Magic + Markup).
- Verlauf: IndexedDB-Settings werden bei „Löschen“ tatsächlich entfernt (`deleteDatabase`).
- Download-Dateinamen und Markdown-Ausgabe werden escaped (DOMPurify `FORBID`).
- `creator-sprite-sheet`: Default `columns=0` (auto) verletzte `min(1)` — Tool crashte mit Standardoptionen.
- `creator-cinemagraph`: fehlendes `-map [v]` (FFmpeg-Exit 234), dreifaches Dekodieren, `zoompan`-Pfad.
- `datenschutz.astro`/`en/privacy.astro`: `{'\n'}`-Ausdruck und Template-Literal-Ternary brachten den
  Astro-Compiler zum Absturz (Web-Build rot).
- `scripts/check-i18n.mjs`: zählte die Locale-Schlüssel `de`/`en` selbst als Kategorie.

### Security

Zusammenfassung aus `docs/SECURITY-REVIEW.md` (F1–F41 in zwei Durchgängen; 3 kritisch, 9 hoch, 18 mittel,
11 niedrig — alle gefixt, Restrisiken als dokumentierte Grenzen 1–11):

- **API (F1, F7, F10–F12, F23):** Jobs an `sha256(apiKey)` gebunden (404 für fremde Keys), zeitkonstanter
  Key-Vergleich, `safeDownloadName` gegen `../` in ZIP-Namen, Upload als Stream mit `Content-Length`- und
  Multipart-Limit, 16-Byte-CSPRNG-Job-IDs, Security-Header + `NEOTOOLS_CORS_ORIGINS`, Audit nur mit Hashes.
- **Desktop (F2, F20):** Datei-I/O nur über Allowlist (Dialog, argv, Dateizuordnung); kein `fs:allow-all`;
  Deep-Link nur `neotools://tool/<kebab>`.
- **PDF-Redact/Verify (F3, F4, F17):** Neu-Schreiben ohne ungenutzte Streams; TJ-Kerning, Form-XObjects,
  AP-Streams, Outline/XMP/StructTree `ActualText` werden gescrubbt; Glyphen ohne ToUnicode ⇒ Verify **fail**;
  Pixel-Skip ist advisory statt grün.
- **PDF-Sanitize (F5):** `/AA`, `OpenAction`, XFA, `Launch`/`URI`/`SubmitForm`, RichMedia, `PieceInfo`,
  Thumbs entfernt; Keyword-Scan außerhalb von Streams.
- **Lizenz (F6, F13, F22):** ohne Pubkey immer Community; `alg=none` und nicht-kanonisches JSON abgelehnt;
  `hasFeature` fail-closed; `issuedAt` > 24 h in der Zukunft ⇒ ungültig; Verify bei jedem IndexedDB-Load.
- **Archive (F8, F18):** Zip-Bomb (Ratio + Größe) bricht ab, TAR-Sym-/Hardlinks übersprungen,
  NFC/Case-Pfadkollisionen erkannt, Glob-Länge begrenzt (ReDoS).
- **Web (F9, F14–F16, F19, F21, F24):** Pipeline-Import über `sanitizePipelineSteps` (Tool-Whitelist, kein
  `__proto__`), SW ohne User-Cache, Magic-basierte Typprüfung, HTML-Escape, `safeAssetUrl`/`safeCssColor`
  für Branding, IDB-Reset, CSP/COOP/COEP/Permissions-Policy in `_headers`, `vercel.json`, nginx,
  E2E-Server, Astro-Middleware und Tauri identisch.
- **Zweiter Durchgang (F25–F41):** Annotation-Strings/AP-Streams werden gescannt und gescrubbt (F25/F27/F28),
  echter Incremental-Update-Angriff im Test (F26), Sanitize entfernt Seiten-/Feld-`/AA` und Outline-Launch auch
  im Modus „Kommentare behalten“ (F29), Byte-Scan mit Token-Grenzen (F30), Lizenz-Grace nur bei gültiger
  Signatur (F31), Rate-Limit pro IP statt pro geratenem Key (F32), Job-Eviction + strikter Owner-Check (F33),
  CORS-Preflight/Fehlertexte/Timeouts (F34), ZIP-Bombe vor dem Inflate über Central Directory + `gunzipLimited`
  (F35), TAR-Prefix/Device-Einträge (F36), Pipeline-Import mit Tiefe-/Größen-/Hash-Limit (F37), SW-Origin-Guard
  (F38), Tauri-CSP-Parität (F39), dist-basierte Netzwerk-Whitelist (F40), Browser-Verify mit Metadaten-Treffern
  (F41).
- Netzwerk-Sweep: alle Laufzeitquellen same-origin; einzige Nutzer-URLs sind TSA-Endpunkte (PAdES, RFC 3161).

## [Welle 4] - 2026-09-14

Office, Sprache, Media, DACH-Vertiefung, Archiv, Plattform (`bd5d049`, `21d6a16`, `4d3b6b1`, `53761f3`,
`89771bd`, `28371d1`, `e9f73a8`).

### Added

- **Office-Pack** `packages/tools-office` (32 Tools): DOCX/XLSX/CSV/JSON/YAML/Markdown/E-Book/Font/Code/SQL —
  SheetJS Community, mammoth, parse5, Papa Parse, KaTeX, bwip-js, sql.js, fonteditor-core, wawoff2,
  OFL-Fonts (Source Sans/Serif/Code). Kein LibreOffice-WASM.
- **Speech-Pack** `packages/tools-speech` (Whisper lokal, `@neotools/models`): Transkription, Untertitel,
  Übersetzung (OPUS-MT), Kapitel, Zusammenfassung, Diarisierung, Bleep-Liste → `audio-bleep`,
  `transcript-edits` → `video-cutlist`.
- **Media-Pack** `packages/tools-media` (FFmpeg-WASM + WebCodecs): Video/Audio-Convert, Edit, Trim, Concat,
  Remux, Normalize, Presets, `media-fit`, `video-cutlist`; H.264 nur via WebCodecs/`mp4-muxer`.
- **Archiv-Pack** `packages/tools-archive` (11 Tools): ZIP/TAR nativ, 7z-wasm dynamisch (LGPL), Inspect,
  Sidecar-Zuordnung, Ordner-Konvertierung.
- **DACH/PDF:** E-Rechnung validieren/erzeugen (ZUGFeRD/XRechnung/Factur-X), Belege, GoBD-Export, GiroCode,
  PDF/UA-Prüfung, Mailmerge, Attachment-Stamp, Team-Presets-Tool.
- **Plattform:** REST-API `apps/api` (Fastify, Compose-Profil `api`), Offline-Lizenz `@neotools/license`
  (Ed25519, Gates nur für api/watch/presets/whitelabel/audit), Team-Presets in Web/CLI/API, `watch` in CLI und
  `/watch`, Pipeline-Builder mit fünf Bibliotheks-Presets, Desktop-Updater/Deep-Link/Menü,
  `docs/DEPLOYMENT.md`.
- `scripts/fetch-ffmpeg-lgpl.mjs` und Workflow `ffmpeg-lgpl.yml` (Build-Versuch; Core in Welle 4 noch GPL).

### Changed

- Lizenzseite nennt FFmpeg-Core als GPL-2.0-or-later (temporär) mit Quellcode-Hinweis.
- `docs/ROADMAP.md`: Stand nach Welle 4 (187 Tools, neun Packs).

## [Welle 3] - 2026-09-14

Bild-Packs, DACH-Basis, PDF-Vertiefung, Format-Wissensbasis (`97c3ffa`, `2f43d07`, `626240d`, `d774f77`,
`103f7ae`).

### Added

- **Bild-Pack** `packages/tools-image` (jSquash-Codecs JPEG/PNG/WebP/AVIF/JXL/oxipng, GIF, TIFF, HEIC
  dynamisch LGPL): Convert, Compress, Resize, Crop, Adjust, Metadaten, Doc-Repair, Screenshot-Studio.
- **KI/CV-Pack** `packages/tools-image-ai` (ONNX Runtime, Transformers.js): Hintergrund entfernen, Gesichter
  blurren, Objekt-Erkennung, Alt-Text, Super-Res/Denoise als Showcases.
- **DACH-Pack** `packages/tools-dach`: beA/ERV-Prüfung, Hash + RFC-3161, Team-Presets.
- **PDF:** `pdf-compare` (Text + Pixel), PDF/A (ehrliche Teilmenge ohne veraPDF), `pdf-aktenbundler`
  (Outline, Bates, Inhaltsverzeichnis), `pdf-sign` (PAdES prüfen, PKCS#12 erstellen).
- **Web:** Format-Wissensbasis, SEO-Routen `/formats/[id]`, `/convert/[from]-to-[to]`, `/spec/[platform]`,
  `/guides/[slug]`; lokaler Verlauf `/verlauf`; `/lizenzen`, `/licenses.json`, `/THIRD_PARTY_NOTICES.txt`.
- `packages/parsers` (JPEG/PNG/TIFF-Parser, geteilt zwischen Packs).

### Fixed

- pdf.js `workerSrc` im Tool-Worker (`d774f77`).

## [Welle 2] - 2026-09-14

PDF-Ausbau innerhalb des Initial-Commits (`619e3f1`) und QA-Gerüst (`f99d54f`).

### Added

- `pdf-lock` (qpdf-WASM, AES-256-Fallback `@cantoo/pdf-lib`), `pdf-repair`, `pdf-compress` mit optionaler
  Linearisierung, `pdf-ocr` (Tesseract.js deu+eng, self-hosted `tessdata`), `pdf-forms` (lesen, füllen,
  flatten).
- Playwright-Smokes gegen statischen Server mit COOP/COEP-Headern, ESLint flat config, CI-Workflow `ci.yml`.

### Changed

- `pdf-organize` → `pdf-reorder`; Capabilities `qpdf`/`ocr` auf Browser- und Node-Platform `true`.

## [Welle 1] - 2026-09-14

Initialer Monorepo-Stand (`619e3f1`).

### Added

- pnpm-Monorepo, TypeScript strict, `packages/engine` (`defineTool`, Registry, Pipeline mit URL-Hash, Batch,
  Provenance, Fehlerprotokoll, Verify-Hook), Platform-Adapter Browser/Node, Worker-Pool (Comlink).
- **PDF-Pack:** merge, split, rotate, reorder, to-images, images-to-pdf, watermark, redact (Klick, Muster,
  NER), sanitize.
- **Forensik-Pack** (10 Tools): identify, autopsy, bytes-compare, hash, hidden-data, fake-ext, watermark-find,
  fingerprint, verify, share-safe.
- `apps/web` (Astro 5 + Preact + Tailwind 4, i18n de/en, PWA), `apps/cli` (`run`, `pipeline`, `list`,
  `info`), `apps/desktop` (Tauri 2, Dateizuordnung, Deep-Link), `deploy/docker` (nginx, COOP/COEP/CSP,
  `branding.json`).
- Lizenzseite aus Pack-Manifesten; keine AGPL-Abhängigkeit, keine CDN-Laufzeit, kein Tracking.

[Unreleased]: ./CHANGELOG.md#unreleased
[Welle 5]: ./docs/SECURITY-REVIEW.md
[Welle 4]: ./docs/ROADMAP.md#stand-nach-welle-4
[Welle 3]: ./docs/ROADMAP.md
[Welle 2]: ./README.de.md#stand
[Welle 1]: ./docs/ROADMAP.md#phase-1--kern-pdf-privacy-gerüst
