# NeoTools Roadmap

Verwandt: [BACKLOG.md](./BACKLOG.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

Phasen entsprechen `docs/BACKLOG.md`. Ein anderer Agent besitzt das Code-Gerüst; diese Datei ist die Abarbeitungsordnung.

## Überblick

| Phase | Ziel | Tools (ohne Community) | Abhängigkeit |
|---|---|---|---|
| 1 | Kern + PDF + Schwärzung + Forensik-Basis + Web/CLI/Docker/Tauri | 38 | — |
| 2 | Bild-Kern + Archiv + Export-Pack + Screenshot-Werkstatt | 69 | Phase-1-Engine |
| 3 | FFmpeg-Kern Video+Audio, Presets, OPFS-Streaming | 76 | Phase-1-Engine; Bild-UI wiederverwenden |
| 4 | Whisper/WebGPU, Office, DACH-Vertiefung, WebLLM | 64 | Modelle im Cache Storage; PDF/OCR aus 1 |
| 5 | Creator-Rest, KI-Showcases, Exotik, Community | 11 (+5 Plugins) | Nutzungsdaten vor Exotik-Formaten |

---

## Phase 1 — Kern, PDF, Privacy, Gerüst

**Meilenstein M1:** Nutzer kann lokal im Browser, per CLI und im Docker-Image PDFs mergen, schwärzen (Klick + Muster + NER) mit Verifikation, sanitizen und eine beA/ERV-Prüfung fahren. Tauri öffnet `.pdf`. Kein Upload, kein CDN, kein Tracking.

### Definition of Done Phase 1

- [ ] `pnpm` Monorepo, TypeScript `strict`, Pakete wie in `ARCHITECTURE.md`
- [ ] `defineTool` + Registry + ein vollständiges Referenz-Tool `pdf-merge`
- [ ] Worker-Pool (Comlink), Cancel, Progress, Fehlerprotokoll ohne Dateiinhalte
- [ ] `Platform`-Adapter Browser und Node
- [ ] Pipeline: JSON + URL-Hash, mindestens `pdf-merge` → `pdf-sanitize`
- [ ] OPFS + IndexedDB + Cache Storage verdrahtet (auch wenn Verlauf-UI noch stub)
- [ ] `privacySensitive`-Hook + `forensics-verify` nach Redact/Sanitize
- [ ] Provenance-JSON optional am Output
- [ ] `apps/web`: Astro, i18n de/en, statische Tool-Seiten aus Registry
- [ ] `apps/cli`: `run`, `pipeline`
- [ ] `deploy/docker`: nginx, COOP/COEP/CSP, `/licenses`, `branding.json`
- [ ] `apps/desktop`: Tauri 2 startet, `.pdf`-Dateizuordnung, Deep-Link-Schema registriert
- [ ] PWA: `file_handlers`, `share_target`, `shortcuts`
- [ ] Format-KB: Schema + Eintrag `pdf` + eine `/formats/pdf`-Seite
- [ ] Vitest Engine grün; Playwright-Smoke: merge, redact+verify, share-safe
- [ ] Golden-Files für `pdf-merge`, `pdf-split`
- [ ] Keine AGPL-Abhängigkeit, keine CDN-Runtime, Lizenzseite listet pdf-lib/pdfjs/qpdf
- [ ] Alle Phase-1-Tool-IDs aus dem Backlog sind registriert (UI darf für XL-Tools „Beta“ zeigen, `run()` muss existieren)

### Welle 1 — Arbeitspakete (1–3 Tage, parallelisierbar)

Jedes WP: eigener Branch, DoD am Ende des Blocks, kein „halb in einem anderen WP“. Aufwand = Kalendertage einer Person.

#### Fundament (Engine)

| ID | Arbeitspaket | Tage | Ergebnis |
|---|---|---|---|
| WP-01 | Monorepo, `pnpm-workspace`, `tsconfig.base` strict, leere Pakete `engine` / `tools-pdf` / `format-kb` / `apps/web` / `apps/cli` / `apps/desktop` / `deploy/docker` | 1 | `pnpm -r build` läuft (Stub-Exporte) |
| WP-02 | `defineTool`, Zod-Options, Registry, Pack-Manifest-Typ, `registerPack` | 1–2 | Unit-Test: Duplikat-ID wirft; `listTools()` sortiert |
| WP-03 | `Platform`-Interface + Browser-Adapter (Blob/OPFS) + Node-Adapter (`fs`) | 2 | Dieselben 3 Tests auf beiden Adaptern grün |
| WP-04 | Worker-Pool Comlink, Progress, Cancel (`AbortController` + `terminate`), Transferables / OPFS-Pfad | 2–3 | Test: Cancel während Fake-Loop bricht ab; zweiter Job startet auf frischem Worker |
| WP-05 | Fehlerprotokoll (Schema, schreiben, JSON-Export, keine Bytes im Log) | 1 | Test mit absichtlich kaputtem PDF |
| WP-06 | Pipeline-Modell: Schritte, MIME-Bindung, JSON laden/speichern, URL-Hash encode/decode | 2 | Test: inkompatible Bindung wird abgelehnt |
| WP-07 | Provenance-Builder + optionales Manifest am Output | 1 | Hash-Kette Input→Output in JSON |
| WP-08 | Privacy-Verify-Hook in der Engine (noch ohne echte OCR): Interface, Pflicht nach `privacySensitive` | 1–2 | Tool ohne Verify-Callback darf bei Flag nicht `shared-safe` setzen |

#### Oberflächen

| ID | Arbeitspaket | Tage | Ergebnis |
|---|---|---|---|
| WP-09 | Astro-App: Layout, i18n de/en, Tool-Seite aus Registry (Preact-Insel: Datei-Input, Options-Form aus Zod, Progress, Download) | 3 | `/de/tools/pdf-merge` und `/en/tools/pdf-merge` prerendered |
| WP-10 | SEO-Generator: `getStaticPaths` aus `seo.path` + `hreflang` | 1 | Jedes registrierte Tool hat genau eine Canonical-URL je Locale |
| WP-11 | Format-KB Schema, Eintrag `pdf`, Seite `/formats/pdf`, Stub `/convert` (noch ohne Matrix) | 2 | KB-JSON validiert gegen Zod |
| WP-12 | CLI: `neotools run <tool> [zod-flags] files…`, `neotools pipeline file.json`, `neotools list` | 2 | `run pdf-merge a.pdf b.pdf` schreibt `merged.pdf` |
| WP-13 | Docker: nginx, statische Assets, Header COOP/COEP/CSP, Volume `/assets` | 1–2 | `curl -I` zeigt COOP/COEP; `/` 200 |
| WP-14 | `branding.json` lesen + White-Label-Platzhalter (Name, Logo, Farbe); Ed25519-Lizenzcheck als **Stub** (Key optional, Community-Default) | 2 | Ohne Key startet Community-Branding |
| WP-15 | PWA-Manifest: `file_handlers` (.pdf), `share_target`, `shortcuts` (merge, redact, share-safe); Service-Worker Shell | 2 | Lighthouse PWA-Basis; Share-Route nimmt File entgegen |
| WP-16 | Tauri 2 Shell, Fenster lädt Web-Dist, Deep-Link `neotools://`, Dateizuordnung `.pdf` (Linux `.desktop` + Windows-Stub) | 3 | App startet; Doppelklick-PDF öffnet Reader-Route |
| WP-17 | Lizenzseite `/licenses` aus Pack-Manifesten; CI-Skript `licenses:check` (AGPL-Fail) | 1 | Seite nennt pdf-lib, pdfjs, qpdf; Ghostscript kommt nicht vor |

#### PDF-Welle

| ID | Arbeitspaket | Tage | Ergebnis |
|---|---|---|---|
| WP-18 | `pdf-merge`, `pdf-split`, `pdf-rotate`, `pdf-reorder` | 2 | Goldens merge+split; CLI+Web |
| WP-19 | `pdf-compress`, `pdf-to-images`, `images-to-pdf` | 2–3 | dpi/Qualität als Zod-Optionen |
| WP-20 | qpdf-WASM: `pdf-lock` (Encrypt/Decrypt, Permissions), Linearize als Option | 2 | Passwort-Roundtrip-Test |
| WP-21 | `pdf-watermark` (Text/Bild) + `pdf-forms` (lesen, füllen, flatten) | 2–3 | Flatten entfernt AcroForm |
| WP-22 | `pdf-redact` Klick-Rechtecke + Textsuche + Muster (IBAN, Steuer-ID, SV-Nr, Ausweisnr., Kennzeichen, E-Mail, Telefon) | 3 | Pixel **und** Text-Objekt weg; Extract enthält Treffer nicht mehr |
| WP-23 | Auto-NER (Transformers.js, kleines lokales Modell) für Namen + Verifikations-UI (Checkliste Fundstellen) | 3 | Verify failt, wenn Box noch Text-OCR liefert |
| WP-24 | `pdf-sanitize` + `forensics-share-safe` (Orchestrierung) | 2–3 | JS, Anhänge, Metadaten, Hidden-Layer im Report |
| WP-25 | `pdf-ocr` Tesseract.js deu+eng, Text-Layer | 2–3 | Durchsuchbares PDF, Modell aus `/assets` |
| WP-26 | `pdf-a` konvertieren + validieren **ohne** Ghostscript/MuPDF (pdf-lib + Validator-WASM oder eigener Regelkern v1: Version, Einbettung, Annotationen) | 3 | Report listet Verletzungen; v1 darf „nicht PDF/A“ ehrlich sagen statt falsch-grün |
| WP-27 | `pdf-aktenbundler`: Merge + Outline + Bates + Inhaltsverzeichnis-Seite | 2–3 | Bates auf jeder Seite, Outline je Quelle |
| WP-28 | `pdf-compare`: Text-Diff-PDF + Pixel-Diff-Preset (`vertrag`) | 3 | Zwei nahe Texte, Diff-Seite erzeugt |
| WP-29 | `pdf-sign`: Signatur **prüfen** (Browser) + PKCS#12 **erstellen** (CLI/Tauri, nicht zwingend Web) | 3 | Fixtures: gültig / abgelaufen / gebrochen |

#### DACH / Forensik-Basis

| ID | Arbeitspaket | Tage | Ergebnis |
|---|---|---|---|
| WP-30 | `dach-bea-erv` Regelwerk v1 (Größe, PDF-Version, JS, Encrypt, Schriften, Anlagen) als JSON + Report | 2 | Fixture „beA-untauglich“ wird rot |
| WP-31 | `dach-hash-timestamp`: SHA-256 + RFC-3161-Client (TSA-URL konfigurierbar, Timeout, Token beilegen) | 2 | Ohne Netz: nur Hash; mit TSA-Mock: Token vorhanden |
| WP-32 | `forensics-identify`, `forensics-autopsy`, `forensics-bytes-compare`, `forensics-hash` | 2 | PDF vs. umbenanntes ZIP erkannt |
| WP-33 | `forensics-hidden-data` + `forensics-fake-ext` | 2–3 | ZIP-after-JPEG und PDF-Attachment schlagen an |
| WP-34 | `forensics-watermark-find` (nur Erkennung) + `forensics-fingerprint` | 2 | Kein Entfernen-Button im UI |
| WP-35 | `forensics-verify` echt (Re-Extract, Muster, OCR-Stichprobe) an WP-08 anschließen | 2 | Pflichtpfad nach Redact/Sanitize |

#### Qualität / Desktop-Reader

| ID | Arbeitspaket | Tage | Ergebnis |
|---|---|---|---|
| WP-36 | Vitest-Harness + Golden-Update-Flag; Goldens für merge/split/lock | 1–2 | CI ohne `GOLDEN_UPDATE` |
| WP-37 | Playwright: drei Smokes (merge, redact+verify, share-safe), i18n-Switch | 2 | Läuft headless im CI |
| WP-38 | Desktop-Reader-Schnitt Phase 1: Anzeige (pdfjs), Suche, Speichern, Sprung in `pdf-redact` | 3 | Geöffnetes `.pdf` ist durchsuchbar, Speichern schreibt lokal |
| WP-39 | Fehlerprotokoll-UI + OPFS-Verlauf-Stub (Liste + Download letztes Output, noch ohne Undo) | 2 | Journal exportierbar |

**Reihenfolge-Hinweis:** WP-01→08 vor Tool-WPs. WP-09 kann parallel zu WP-04 starten (Mock-`run`). WP-16/38 nach WP-09. WP-23 braucht WP-22. WP-35 nach WP-23/24.

**Nicht in Welle 1:** Formular-Mailmerge, PDF-UA-Reparatur, E-Rechnung, REST-API, WebLLM, FFmpeg, Bild-Packs.

---

## Phase 2 — Bild, Archiv, Export, Screenshot

**Meilenstein M2:** Bildkonverter (Welle-2-Formate), Dokument-Foto-Reparatur, Screenshot-Werkstatt, Export-Pack-Presets, Archiv-Rundgang. Alles lokal, jSquash/heic/UTIF self-hosted.

### Definition of Done Phase 2

- [ ] `packages/tools-image` und `tools-archive` lazy geladen
- [ ] `image-convert` für die in Backlog genannten Welle-2-Formate (ohne PSD/EXR/DDS/XWD/JP2/RAW-Entwicklung)
- [ ] `image-doc-repair` mit Presets scanner / whiteboard / kinderzeichnung / moire / notiz-ocr
- [ ] `image-screenshot-studio` mit allen acht Presets
- [ ] `creator-export-pack` liest Größen aus Format-KB
- [ ] OpenCV.js nur lazy auf der Dokument-Foto-Seite
- [ ] Archiv create/extract/inspect für ZIP + mindestens ein 7z/TAR-Pfad
- [ ] `platform-folder-convert` + `platform-watch` (FSA und CLI)
- [ ] OPFS-Verlauf mit Undo (ein Schritt)
- [ ] Playwright: convert PNG→WebP, doc-repair, export-pack favicon
- [ ] Keine Exotik-Formate im UI außer Hinweis „nicht unterstützt“

### Meilensteine Phase 2 (keine 1-Tage-WPs, grob)

1. Bild-I/O + Compress/Resize/Crop/Adjust/Metadaten  
2. Doc-Repair + Screenshot-Studio + Auto-Blur + Verify  
3. Export-Pack + Spec-Check + Sticker-Set  
4. Archiv-Suite + Sidecar-Zuordnung (ohne RAW-Develop)  
5. Folder-Convert, Watch, Undo  

---

## Phase 3 — FFmpeg (Video + Audio)

**Meilenstein M3:** Ein LGPL-ffmpeg.wasm im Cache Storage; Video- und Audio-Convert; einfache Filter nur als Presets am Kern; große Dateien über OPFS gestreamt. H.264-Encode nur via WebCodecs, sonst VP9/AV1 oder klare Verweigerung.

### Definition of Done Phase 3

- [ ] ffmpeg.wasm **LGPL-Build** im Repo dokumentiert (Configure-Flags, kein x264/x265)
- [ ] `video-convert`, `video-edit`, `audio-convert`, `audio-edit` als einzige Filter-Träger
- [ ] Alle 18 Backlog-FFmpeg-Presets als Preset-IDs, nicht als eigene Routen
- [ ] `media-fit` Binärsuche Zielgröße
- [ ] `platform-stream-opfs` für Dateien über der RAM-Schwelle
- [ ] `/licenses` nennt LGPL-FFmpeg + Hinweis H.264/WebCodecs
- [ ] Playwright: Trim + Remux (wo Fixture klein genug)
- [ ] Whisper-abhängige Video-Tools existieren **noch nicht** (Phase 4)

### Meilensteine Phase 3

1. WASM-Build, Loader, OPFS-Streaming  
2. Video-I/O + Remux/Trim/Concat/Extract  
3. Filterkern + Preset-Tabelle  
4. Audio-I/O + Normalize/Join/Silence  
5. Repair, HDR-Presets, Scene-Detect, Epilepsie-Report  

---

## Phase 4 — Sprache, Office, DACH-Vertiefung

**Meilenstein M4:** Whisper lokal (WebGPU), Untertitel-Kette, E-Rechnung prüfen/erzeugen, PDF-UA-Check, Team-Presets, optionale REST-API, WebLLM-Chat gegen lokale PDFs.

### Definition of Done Phase 4

- [ ] `speech-transcribe` mit wählbarem Modell; Modelle same-origin
- [ ] Jump-Cut / Auto-Kapitel / OCR-Subs hängen an Whisper, keine zweite Engine
- [ ] Office: DOCX, XLSX (**SheetJS Community**), EPUB-Unpack
- [ ] `dach-erechnung-validate` + `generate` (ZUGFeRD/XRechnung/Factur-X)
- [ ] `pdf-ua` prüft; Reparatur best-effort, kein falsch-grün
- [ ] `platform-rest-api` Sidecar nur im Docker-Compose-Profil `api`
- [ ] `platform-fulltext` über OPFS (FlexSearch oder SQLite-WASM)
- [ ] WebLLM hinter `speech-chat-doc`, Default-Modell dokumentiert
- [ ] Team-Presets JSON sperrt Tools / setzt Defaults
- [ ] Benchmark **nicht** nötig (Phase 5)

### Meilensteine Phase 4

1. Whisper + Subtitle-Edit + Translate  
2. Speech-abhängige Video/Audio-Tools  
3. Office-Pack  
4. E-Rechnung + Belege + GoBD + GiroCode  
5. PDF-UA, Mailmerge, Posteingang-Pipeline, API, Volltext, WebLLM  

---

## Phase 5 — Creator, Showcases, Community

**Meilenstein M5:** Plugin-Loader, zwei Showcases (Super-Res, Denoise) klar als Demo gekennzeichnet, Extension optional, Exotik-Formate nur wenn Telemetrie/Nutzungsdaten (self-hosted counts) Bedarf zeigen.

### Definition of Done Phase 5

- [ ] Community-Manifest-Loader, Sandbox: kein `platform` außer deklarierten Caps
- [ ] `image-superres` und `image-denoise` je eine Seite, Banner „Showcase“
- [ ] `community-exotic` hinter Feature-Flag, Default aus
- [ ] Keine ROM-Header-, Inpainting-Wasserzeichen- oder CLIP-Tools im Kern
- [ ] `platform-benchmark` misst Worker/WASM/WebGPU auf einer internen Seite
- [ ] Browser-Extension teilt Registry, keine zweite Tool-Implementierung

---

## Querschnitt (alle Phasen)

| Thema | Regel |
|---|---|
| Lizenz | Jedes neue Pack aktualisiert Manifest + `/licenses` im selben PR |
| i18n | Kein hardcodiertes UI-Deutsch ohne `en`-Pendant |
| Tests | Neues Tool: mindestens 1 Vitest + Golden oder explizite Begründung (lossy → Metrikband) |
| SEO | Keine `/convert/a-to-b`-Seite ohne KB-Kante und Tool |
| Privacy | Neue Privacy-Ops am Verify-Hook anmelden |
| Modelle | Dateiname enthält Content-Hash; Service Worker cache bustet darüber |

---

## Welle-1-Liste (Kopiervorlage)

1. WP-01 Monorepo + leere Pakete  
2. WP-02 Tool-Schema + Registry  
3. WP-03 Platform Browser/Node  
4. WP-04 Worker-Pool + Cancel + Progress  
5. WP-05 Fehlerprotokoll  
6. WP-06 Pipeline + URL-Hash  
7. WP-07 Provenance  
8. WP-08 Verify-Hook (Interface)  
9. WP-09 Astro + i18n + Tool-Insel  
10. WP-10 SEO-Pfade  
11. WP-11 Format-KB + `/formats/pdf`  
12. WP-12 CLI `run` / `pipeline` / `list`  
13. WP-13 Docker nginx + Header  
14. WP-14 Branding + Lizenz-Stub  
15. WP-15 PWA-Manifest + SW  
16. WP-16 Tauri 2 + Dateizuordnung + Deep-Link  
17. WP-17 Lizenzseite + AGPL-CI  
18. WP-18 pdf-merge/split/rotate/reorder  
19. WP-19 compress + raster I/O  
20. WP-20 qpdf lock/unlock  
21. WP-21 watermark + forms  
22. WP-22 redact Klick + Muster  
23. WP-23 NER + Verifikations-UI  
24. WP-24 sanitize + share-safe  
25. WP-25 OCR deu+eng  
26. WP-26 PDF/A ohne AGPL  
27. WP-27 Aktenbundler  
28. WP-28 Vergleich Text+Pixel  
29. WP-29 PAdES prüfen / PKCS#12 (CLI/Desktop)  
30. WP-30 beA/ERV v1  
31. WP-31 Hash + RFC-3161  
32. WP-32 identify / autopsy / bytes / hash  
33. WP-33 Hidden-Data + Fake-Ext  
34. WP-34 Watermark-Find + Fingerprint  
35. WP-35 Verify echt verdrahten  
36. WP-36 Vitest + Goldens  
37. WP-37 Playwright-Smokes  
38. WP-38 Desktop-Reader Anzeige/Suche/Speichern  
39. WP-39 Journal-UI + Verlauf-Stub  

## Status WP-22 / WP-23 / WP-35 erledigt

- **WP-22 erledigt:** `pdf-redact` (Klick-Regionen, Textsuche, DACH-Muster inkl. IBAN-mod97 / Steuer-ID-Prüfziffer / Kennzeichen-Kreis, echte Content-Stream-Entfernung von `Tj`/`TJ`/`'`/`"`, Form-XObjects, Bild-XObjects, Raster-Fallback, CLI `--regions` JSON, Vitest + Golden-Report).
- **WP-23 erledigt:** NER-Hook über Transformers.js (lokal, Ladepfad via `Platform.assets.nerModel`, im Test gemockt; fehlt das Modell → Warnung). Web-UI `RedactEditor` + Verifikationsblock (grün/rot).
- **WP-35 erledigt:** Engine-`verify?(ctx, outputs, options)` läuft im Runner/`runPipeline` nach `run` auf **neu geladenen Output-Bytes**. Ergebnis liegt in `ToolResult.report.verification`. `pdf-sanitize` prüft JS/OpenAction/Metadaten/FileAttachments/PieceInfo/Thumbnails/OCG; `pdf-redact` prüft Re-Extract, Metadaten und Pixel-Stichprobe.

## Status WP-16 / WP-38 erledigt

- **WP-16 erledigt:** Tauri-2-Desktop mit Dateizuordnung `.pdf`, `--open`, macOS-`Opened`, Single-Instance, Commands `read_opened_file` / `save_file` / `pick_save_path`, Icon-Set, CI-Matrix Windows/macOS/Linux. Updater nur als Platzhalter konfiguriert.
- **WP-38 erledigt:** PDF-Reader `/reader` (+ `/en/reader`): pdfjs-Anzeige, virtuelles Scrollen, Suche, Formulare, Annotationen, Speichern (Web/Tauri), Tool-Handoff (`pdf-reorder` und andere PDF-Tools).

## Status WP-32 / WP-33 / WP-34 erledigt

- **WP-32/33/34 erledigt:** Pack `forensics` (`@neotools/tools-forensics`) Phase 1: `forensics-identify`, `forensics-autopsy`, `forensics-bytes-compare`, `forensics-hash`, `forensics-hidden-data`, `forensics-fake-ext`, `forensics-share-safe`, `forensics-fingerprint`, `forensics-watermark-find`, `forensics-provenance`.

## Status

WP-19/20/25 + Rename erledigt

## Status QA / Integration (WP-37)

- Git-Repo auf `main` initialisiert (erster Commit: wave 1+2). Kein Remote.
- ESLint (flat) + Prettier root-weit; Root-Scripts `dev`/`build`/`test`/`typecheck`/`lint`/`e2e`/`cli`.
- Playwright-Smokes in `apps/web/e2e/` gegen Static-Server mit Produktions-Headern; CI `.github/workflows/ci.yml` (build, test, typecheck, lint, chromium-smoke, Report-Artefakt bei Fehler). `desktop.yml` unverändert.
- `packages/tools-pdf/src/pdfjs.ts` setzt `GlobalWorkerOptions.workerSrc` (self-hosted Worker). Smoke `d2` (Redact Auto-Treffer + Verify) ist aktiv.

## Status Pack `image` KI/CV (`@neotools/tools-image-ai`)

- Paket `packages/tools-image-ai` mit Tools `image-remove-background`, `image-auto-blur`, `image-doc-repair`, `image-screenshot-workshop`, `image-upscale`, `image-denoise`, `image-alt-text` (pack `a11y`).
- ONNX Runtime (WebGPU→WASM / Node), Modell-Registry `src/models/models.json`, `scripts/fetch-models.mjs`, Cache Storage / `~/.cache/neotools/models`.
- Keine AGPL-Gewichte (kein Ultralytics-YOLOv8, kein RMBG-1.4). Raster-Codec PNG/JPEG lokal; Umstellung auf `@neotools/tools-image` geplant (gleiche Signatur).
- CLI: `neotools models fetch <tool>|--all`. Kategorie „KI & Erkennung“ / „AI & Detection“.
- Bericht: `docs/reports/tools-image-ai.md`.

## Status Pack `image` Kern (Phase 2)

- Paket `packages/tools-image` (`@neotools/tools-image`) mit Codec-Schicht (jSquash lazy/WASM, eigene BMP/TGA/PNM/ICO, UTIF, gifuct/gifenc, upng-js, HEIC dynamisch LGPL, SVG Browser/`@resvg` optional).
- Parser JPEG/PNG/TIFF nach `packages/parsers` (`@neotools/parsers`) extrahiert; Forensik re-exportiert unverändert.
- Tools: convert, compress, resize, crop (+Kreis), rotate-flip, adjust, watermark, metadata+verify, redact+verify, compare, creator-export-pack, image-to-animation (kein Video), palette, colorblind, exif-batch, duplicates, ascii.
- Nicht gebaut (Agent AI): Hintergrund, Auto-Blur, Doc-Repair, Screenshot-Werkstatt. `images-to-pdf` bleibt im PDF-Pack.
- Tests: Vitest Roundtrips, Resize/Crop, EXIF, Verify, Compress, Compare, Export-Pack, Palette, Duplikate. HEIC/SVG-Node als Skip/Fehlerhinweis.

## Status Pack `pdf` Phase-1-Rest + Pack `dach` (WP-26–31)

- **pdf-compare:** Text-Diff (pdfjs-Absätze, Wort-Diff `diff`, Seiten-Alignment über Absatz-Hashes), Pixel-Heatmap+SSIM (Canvas / sonst Hinweis), Diff-PDF + JSON + Markdown. Presets `text` / `pixel` / `vertrag`.
- **pdf-a:** Eigene Regelmaschine PDF/A-2b/3b (Teilmenge, kein veraPDF). XMP/pdfaid, Info↔XMP, Encrypt, JS/Launch, Fonts inkl. Standard-14, LZW, OutputIntent+sRGB-ICC (Debian icc-profiles-free, zlib), Anhänge 2b/3b+AFRelationship, Header 1.4–1.7, %%EOF, qpdf `--check`. Convert best-effort + `verify`-Hook.
- **pdf-aktenbundler:** Deckblatt, TOC mit Link-Annotationen, verschachtelte Outlines (`outlines.ts`), Bates über `page-stamps.ts` (pdf-page-numbers re-exportiert), Kopfzeile, optional Trennblätter/Anlagen-Stempel, JSON-Index.
- **pdf-sign:** Prüfen (ByteRange/CMS via pkijs, PAdES B-B/B-T/B-LT grob, inkrementelle Änderung). Erstellen PKCS#12 (node-forge) + PAdES-B-B (`ESS signing-certificate-v2`), `verify`-Hook. TSA nur bei gesetzter URL.
- **Pack `dach`:** `dach-bea-erv` (Regelwerk `rules/erv.json` v2026-01, ERVV §2/§5 + ERVB, Auto-Fix-Pipeline), `dach-hash-timestamp` (SHA-256/512, RFC-3161 optional, Nachweisblatt), `dach-girocode` (EPC069-12, qrcode, zxing-wasm).
- Web: Markdown-Outputs (`marked` + DOMPurify). Kategorien Vergleichen / Archivierung / DACH-Business & Recht.

## Status Integration Welle 3 (Owner)

- Uncommitted Arbeit seit `f99d54f` integriert: Packs `image` (17) + `image-ai` (7), PDF-Rest (`pdf-compare`, `pdf-a`, `pdf-aktenbundler`, `pdf-sign`), Pack `dach` (3), Format-KB (≥45), SEO-Routen, Verlauf, Lizenzen.
- `gifenc` CJS→ESM lazy (`createRequire`/Default-Export), damit `neotools list` nicht mehr bricht.
- `tools-image-ai` `raster.ts` re-exportiert `@neotools/tools-image` (`decode`/`encode`/`resample`/`boxBlur`/`pixelate`/`stripJpegSegments`). `image-alt-text` schreibt EXIF/XMP über den Metadaten-Writer.
- Convert-SEO-Seiten auf real abgedeckte Bildpaare begrenzt (kein tga/ppm-Kartesisches Produkt).
- Playwright: 12 Chromium-Smokes inkl. `d2`, `/image-convert` (PNG→JPG/`FFD8`), `/formats/jpg`+JSON-LD, `/verlauf` nach Tool-Lauf. Hydration-Wait (`data-tool-ready` / `data-reader-ready`) vor Datei-Upload.
- `verifyRedactedPdf` ignoriert technische Info-Felder (`D:YYYYMMDD…`, pdf-lib Producer), damit CreationDate nicht als Telefonnummer fehlschlägt.
- Bericht: `docs/reports/tools-image-ai.md`.

## Offen für Welle 4

- Office-/Media-/Speech-Packs (FFmpeg LGPL, Whisper, E-Rechnung).
- HEIC-Decode in Node ohne optionales libheif; SVG-Raster ohne `@resvg` bleibt Browser-only.
- PDF/A ist eine ehrliche Teilmenge (kein veraPDF); PAdES-TSA nur bei gesetzter URL.
- Desktop-Updater und White-Label-Lizenzschlüssel bleiben Stubs.
- Super-Res/Denoise bleiben Showcases ohne Qualitätsversprechen.

## Status Pack `speech` (Welle 4)

- Paket `@neotools/tools-speech` (`packages/tools-speech`): 12 Tools, Kategorie „Sprache & Untertitel“ / „Speech & Subtitles“.
- Gemeinsame Modell-Registry nach `@neotools/models` extrahiert; `tools-image-ai` re-exportiert (Shim). CLI: `neotools models fetch speech-transcribe`.
- Whisper (Transformers.js v3, WebGPU→WASM, Node ORT), Untertitel-Parser/Writer, Cutlist/Kapitel/Notes, OCR-Frames, Bleep-Liste, a11y-AD-Entwurf.
- Decoder ohne FFmpeg: WAV/PCM, MP3, OGG/Opus, FLAC; Browser `decodeAudioData`; Node-Video → Hinweis + optional `@neotools/tools-media`.

## Status Pack `dach` Phase 4 + Pack `pdf` Phase 4 + Pack `archive` (Welle 4)

- **E-Rechnung Validierung:** XSD **nein** (Default; `scripts/fetch-schemas.mjs` lädt OASIS/KoSIT nach `assets/schemas/`, gitignored). Schematron/SaxonJS **nein** (optional, nicht gebündelt). Stattdessen: Wohlgeformtheit + Profil (CII/UBL, MINIMUM…XRECHNUNG) + EN-16931-BT-Tabelle + **~60 TypeScript-BR** (BR-01…BR-65 Kern, BR-CO-10/14/15/16/17, BR-DE-*, BR-IBAN-01) + Arithmetik. Kein falsch-grün.
- **Tools DACH:** `dach-erechnung-validate` / `generate` (CII+UBL+PDF/A-3b Factur-X, `verify`-Hook) / `paper-to-erechnung` / `receipt-split` / `receipt-export` (DATEV EXTF 700) / `statement-camt` (CAMT.053+MT940) / `gobd` / `deadline` (§§ 187–193 BGB) / `team-presets` (Zod+Ed25519).
- **`applyTeamPresets(registry, presets)`** (`packages/engine/src/presets.ts`): Defaults unter Caller-Optionen mergen, `locked[toolId]` erzwingen, `hiddenTools` weglassen, `watermarkText`/`batesPrefix` wenn Option existiert. `getAppliedPresets` / `requiredPipelines` für Agent P (Web/Docker lädt/enforced). Tool `dach-team-presets` validiert/normalisiert/signiert.
- **PDF Phase 4:** `pdf-form-mailmerge` (CSV/XLSX→AcroForm), `pdf-attachment-stamp` (Anlage K/B, additiv zu Aktenbundler), `pdf-ua` (Check + Repair Lang/Titel/MarkInfo/Tabs/pdfuaid; **kein** Content-Stream-MCID-Tagging).
- **Pack `archive`** `@neotools/tools-archive`, Kategorie `archive-pack` / „Archive & Ordner“: 11 Tools (ZIP/TAR/GZ nativ via fflate; 7z/RAR/ISO nur dynamisch libarchive.js). Zip-Slip-Block, Zip-Bomb-Ratio-Warnung, Sidecar-Wrangler, Hash-Duplikate, Space-Radar, Ordner-Diff, SHA-256-Manifest.
- **Lizenzen:** fflate MIT, `@zip.js/zip.js` BSD-3, `@noble/ed25519`+`@noble/hashes` MIT, SheetJS Community Apache-2.0, libarchive.js MIT (dynamic), 7z-wasm LGPL-2.1 (dynamic, nicht gebündelt), KoSIT Apache-2.0 / SaxonJS MPL-2.0 / libxml2-wasm MIT (optional fetch, nicht Default). Keine AGPL, keine CDN-Schemas.
- **Grenzen:** Keine volle XSD/Schematron-Kette offline; PDF-UA ohne echte Tags/MCIDs; 7z-Schreiben nicht nativ; Factur-X-XML nach pdf-a-Convert best-effort (`NeoFacturX`-Stream); Team-Presets-Enforcement im UI ist Agent P.
- **Tests:** Generator→Validator grün; injizierte Summe/Leitweg/IBAN; PDF/A-3-Extraktion; DATEV-Header-Snapshot; CAMT/MT940-Struktur; BGB-Fristen; GoBD verify/tamper; Ed25519 + locked option; Mailmerge n→n; PDF-UA Repair weniger Befunde; ZIP/TAR, Zip-Slip, Bomb-Ratio, Sidecars, Ordner-Diff.
- **Commit:** `feat(dach,archive,pdf): e-invoice, receipts, gobd, pdf-ua, archive pack (wave 4)` (Hash nach Commit).

