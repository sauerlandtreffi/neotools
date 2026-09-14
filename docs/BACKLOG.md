# NeoTools Backlog

Verwandt: [ARCHITECTURE.md](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md)

Kanonische Tool-Liste. UI, CLI, Pipelines, SEO-Seiten und Docs werden aus `defineTool` generiert. IDs sind stabil (kebab-case); Umbenennungen nur über Alias, nie durch ID-Wechsel.

## Legende

| Spalte | Bedeutung |
|---|---|
| ID | Stabile Tool-ID |
| Titel | UI-Titel (de) |
| Pack | npm-Paket / Plugin-Pack |
| Umsetzung | Libraries **oder** `FFmpeg-Preset → <kern-id>` |
| Aufwand | S ≤ 1 Tag · M 2–4 Tage · L 1–2 Wochen · XL > 2 Wochen |
| Phase | 1 Kern/PDF/Privacy · 2 Bild · 3 FFmpeg · 4 Sprache/Office/DACH · 5 Creator/KI/Exotik |
| Zusammengelegt aus | Quellideen, die in diesem Tool/Preset aufgehen |
| Notiz | Abgrenzung, Presets, Verbote |

Pack-Namen = Pakete: `pdf` → `packages/tools-pdf`, `image` → `tools-image`, `media` → `tools-media`, `speech` → `tools-speech`, `forensics` → `tools-forensics`, `office` → `tools-office`, `archive` → `tools-archive`, `dach` → `tools-dach`. Zusätzlich logische Packs ohne eigenes Paket in Phase 1: `creator` und `a11y` (leben bis Phase 5 in `image`/`media`/`pdf`, ziehen dann aus), `platform` (Engine/Apps, keine Tool-Runtime).

## Phasen (verbindlich)

| Phase | Inhalt |
|---|---|
| 1 | Engine + PDF-Paket + Schwärzung + Forensik-Basis + Web/CLI/Docker/Tauri-Gerüst |
| 2 | Bild-Kern + Archiv + Export-Pack + Screenshot-Werkstatt |
| 3 | FFmpeg-Kern (Video+Audio) inkl. einfacher Filter als Presets |
| 4 | Whisper/WebGPU + Office/E-Books + DACH-Vertiefung + a11y-Kern |
| 5 | Creator-Rest, KI-Showcases, Exotik-Formate, Community-Plugins |

---

## Pack `pdf` — `packages/tools-pdf`

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| pdf-merge | PDFs zusammenführen | pdf | pdf-lib | S | 1 | Merge | Lesezeichen optional als Outline | ✅ umgesetzt |
| pdf-split | PDF teilen | pdf | pdf-lib | S | 1 | Split | Bereiche, Einzelseiten, jedes-n | ✅ umgesetzt |
| pdf-compress | PDF komprimieren | pdf | pdf-lib, pdfjs-dist, jSquash | M | 1 | Komprimieren | Bilder neu kodieren; keine Ghostscript | ✅ umgesetzt |
| pdf-rotate | PDF drehen | pdf | pdf-lib | S | 1 | Drehen | Seite/Bereich, 90/180/270 | ✅ umgesetzt |
| pdf-reorder | Seiten ordnen | pdf | pdf-lib | S | 1 | Ordnen | Drag-Drop-UI; CLI: Indexliste | ✅ umgesetzt |
| pdf-watermark | Wasserzeichen (PDF) | pdf | pdf-lib | M | 1 | Wasserzeichen | Text/Bild, Kachelung, Deckkraft | ✅ umgesetzt |
| pdf-redact | Schwärzen | pdf | pdf-lib, pdfjs-dist, Transformers.js NER, Tesseract.js | XL | 1 | Redigieren; Schwärzung Klick; Auto-Muster; Auto-NER; Verifikation danach | Muster: IBAN, Steuer-ID, SV-Nr, Ausweisnr., Kennzeichen, E-Mail, Telefon. Namen lokal via NER. Pixel + Text entfernen (nicht übermalen). Pflicht: Verifikationsschritt | ✅ umgesetzt |
| pdf-lock | Sperren / Entsperren | pdf | qpdf-WASM | M | 1 | Sperren; Entsperren | Encrypt/Decrypt, Berechtigungen | ✅ umgesetzt |
| pdf-sign | PAdES prüfen / erstellen | pdf | pdfjs-dist, WebCrypto, PKCS#12 (Desktop/CLI) | L | 1 | Signieren; PAdES; PKCS#12 | Browser: prüfen. Erstellen: Tauri/CLI (Keystore). Kein iText | ✅ umgesetzt |
| pdf-forms | Formulare | pdf | pdf-lib, pdfjs-dist | M | 1 | Formulare | Lesen, füllen, flatten | ✅ umgesetzt |
| pdf-ocr | OCR → durchsuchbares PDF | pdf | Tesseract.js (deu+eng), pdfjs-dist, pdf-lib | L | 1 | OCR | Text-Layer; Sprache wählbar | ✅ umgesetzt |
| pdf-to-images | PDF → JPG/PNG | pdf | pdfjs-dist, optional PDFium-WASM | S | 1 | PDF→JPG/PNG | dpi, Bereich, Format | ✅ umgesetzt |
| images-to-pdf | Bilder → PDF | pdf | pdf-lib | S | 1 | Bilder→PDF | Seitengröße, Fit, dpi | ✅ umgesetzt |
| pdf-compare | Dokument / Vertrag vergleichen | pdf | pdfjs-dist, Text-Diff, Pixel-Diff | L | 1 | PDF-Vergleich; Vertrags-Versionsvergleich | Presets: `text-pdf`, `pixel`, `vertrag`. Ausgabe: Diff-PDF | ✅ umgesetzt |
| pdf-a | PDF/A konvertieren & validieren | pdf | pdf-lib, veraPDF-WASM o. ä. (kein Ghostscript, kein MuPDF) | L | 1 | PDF/A | Ziel PDF/A-2b/3b; Validierungsreport | ✅ umgesetzt |
| pdf-sanitize | Sanitize für Weitergabe | pdf | pdf-lib, qpdf-WASM | L | 1 | Sanitize; „Sicher teilen“-Pack (PDF-Teil) | JS, eingeb. Dateien, Metadaten, ungenutzte Objekte, Hidden-Layer. Danach Verifikation | ✅ umgesetzt |
| pdf-aktenbundler | Aktenbundler | pdf | pdf-lib | L | 1 | Aktenbundler | Inhaltsverzeichnis, Lesezeichen, Bates-Stempel, einheitliche Kopfzeile | ✅ umgesetzt |
| pdf-form-mailmerge | Formular-Massenausfüllung | pdf | pdf-lib | M | 4 | Formular-Massenausfüllung aus CSV | Ein Datensatz → eine PDF | ✅ umgesetzt |
| pdf-attachment-stamp | Anlagen-Stempel | pdf | pdf-lib | M | 4 | Anlagen-Stempel | „Anlage 3 zu Az. …“, Seite/Bates | ✅ umgesetzt |
| pdf-ua | PDF-UA / BITV prüfen & reparieren | pdf | pdfjs-dist, pdf-lib, axe-ähnliche Regelmaschine | L | 4 | PDF-UA/BITV | Tags, Sprache, Alt, Lesereihenfolge. Reparatur best-effort | ✅ umgesetzt |

---

## Pack `dach` — `packages/tools-dach`

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| dach-bea-erv | beA / ERV-Konformität | dach | pdfjs-dist, Regelwerk (JSON) | M | 1 | beA/ERV-Check | Dateigröße, PDF-Version, JS, Verschlüsselung, Schriften, Anlagen. Report, kein Versand | ✅ umgesetzt |
| dach-hash-timestamp | Dokument-Hash + RFC-3161 | dach | WebCrypto SHA-256, TSA-Client | M | 1 | Dokument-Hash; RFC-3161-Zeitstempel | TSA-URL konfigurierbar; Token beilegen | ✅ umgesetzt |
| dach-deadline | Fristen / Daten → ICS/CSV | dach | pdfjs-dist, Tesseract.js, Regex+NER | M | 4 | Fristen-/Datums-Extraktor | Fundstellen mit Seite; ICS + CSV | ✅ umgesetzt |
| dach-erechnung-validate | E-Rechnung prüfen / anzeigen | dach | XML-Parser, Schematron/XSD lokal, pdf-lib (ZUGFeRD) | L | 4 | E-Rechnung-Validator/Viewer; ZUGFeRD; XRechnung; Factur-X | Kein Fremd-Upload | ✅ umgesetzt |
| dach-erechnung-generate | E-Rechnung erzeugen | dach | XML-Writer, pdf-lib (PDF/A-3 + Zugferd) | L | 4 | E-Rechnung-Generator | Profil wählbar; Validierung danach | ✅ umgesetzt |
| dach-paper-to-erechnung | Papierrechnung → E-Rechnung | dach | Tesseract.js, NER, dach-erechnung-generate | XL | 4 | Papierrechnung-Assistent | Mensch bestätigt Felder vor Export | ✅ umgesetzt |
| dach-receipt-split | Beleg-Splitter | dach | pdf-lib, pdfjs-dist, Szenen/Leerseiten | M | 4 | Beleg-Splitter | Stapel → Einzel-PDFs | ✅ umgesetzt |
| dach-receipt-export | Belegdaten → DATEV/Lexoffice/sevDesk | dach | OCR+NER, CSV-Writer | L | 4 | Belegdaten-Export; Rechnung→JSON/CSV | Presets: DATEV, Lexoffice, sevDesk, JSON | ✅ umgesetzt |
| dach-statement-camt | Kontoauszug PDF → CSV/CAMT | dach | pdfjs-dist, Tabellen-Heuristik | L | 4 | Kontoauszug-Export | Bank-Presets erweiterbar | ✅ umgesetzt |
| dach-gobd | GoBD-Archivpaket | dach | JSZip, WebCrypto | L | 4 | GoBD-Archivpaket | Hash-Manifest, Verzeichnis, unveränderbare Ablage | ✅ umgesetzt |
| dach-amtlich | Pipeline „Amtliche Veröffentlichung“ | dach | Pipeline-Preset (pdf-a, pdf-ua, sanitize, hash) | M | 4 | Amtliche Veröffentlichung | Kein eigenes Binary; serialisierte Pipeline | offen |
| dach-posteingang | Posteingang digitalisieren | dach | image-doc-repair + pdf-ocr + pdf-aktenbundler + dach-deadline | L | 4 | Posteingang-Digitalisierung | Pipeline-Preset + UI-Wizard | offen |
| dach-girocode | GiroCode / EPC-QR | dach | zxing-wasm | S | 4 | GiroCode; EPC-QR | Erzeugen + lesen; SEPA-Felder | ✅ umgesetzt |
| dach-team-presets | Team-Presets / Richtlinien | dach | JSON-Schema, Signatur optional | M | 4 | Team-Presets/Richtlinien JSON | White-Label/Docker; Tools sperren, Default-Optionen | ✅ umgesetzt |

---

## Pack `forensics` — `packages/tools-forensics`

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| forensics-identify | Datei identifizieren | forensics | Magic-Bytes, Container-Parser | M | 1 | Datei identifizieren; Fake-Extension (Teil) | MIME vs. Extension vs. Inhalt | ✅ umgesetzt |
| forensics-autopsy | File-Autopsy | forensics | Parser je Container | M | 1 | File-Autopsy | Bäume: PDF-Objekte, ZIP, MP4-Boxen, ID3 | ✅ umgesetzt |
| forensics-bytes-compare | Exact-Bytes-Compare | forensics | SHA-256, Block-Diff | S | 1 | Exact-Bytes-Compare | Offset-Liste | ✅ umgesetzt |
| forensics-hash | Output hashen | forensics | WebCrypto | S | 1 | Output hashen; SHA-256-Manifest (Einzeldatei) | SHA-256/512; Clipboard | ✅ umgesetzt |
| forensics-hidden-data | Hidden-Data-Radar | forensics | PDF-Parser, ZIP-after-JPEG, Polyglot-Signaturen | L | 1 | Hidden-Layer-Check; Hidden-Data-Radar; ZIP hinter JPEG; Polyglot | Layer, Anhänge, Overflow, Dual-Content | ✅ umgesetzt |
| forensics-fake-ext | Fake-Extension | forensics | forensics-identify | S | 1 | Fake-Extension | Report-Tool; UI-Warnung wiederverwendbar | ✅ umgesetzt |
| forensics-share-safe | Sicher teilen? | forensics | Orchestriert sanitize + Radar + PII-Scan | L | 1 | Sicher zum Teilen?; „Sicher teilen“-Pack; Audit-Report (Anstoß) | Checkliste + Ein-Klick-Sanitize. Danach Verifikation | ✅ umgesetzt |
| forensics-verify | Privacy-Verifikation | forensics | Engine-Hook, Re-Scan, Textsuche, Pixel-Stichprobe | M | 1 | Verifikation nach Privacy-Operation | Pflicht nach `pdf-redact`, `pdf-sanitize`, `image-redact`, `image-auto-blur`, `image-metadata` (strip) | offen |
| forensics-provenance | Provenance-Manifest | forensics | JSON + Quell-Hash + Pipeline + Parameter | M | 1 | Provenance-Manifest | Optional an Output; kein PII der Inhalte | ✅ umgesetzt |
| forensics-fingerprint | Dokument-Fingerabdruck | forensics | Perceptual Hash, Font/Drucker-Merkmale | M | 1 | Dokument-Fingerabdruck | Kein Cloud-Abgleich | ✅ umgesetzt |
| forensics-watermark-find | Wasserzeichen finden | forensics | pdfjs-dist, Canvas, Heuristik | M | 1 | Wasserzeichen finden | **Nur Erkennung.** Entfernen via Inpainting verboten | ✅ umgesetzt |
| forensics-stego | Stego-Sniff | forensics | LSB/Statistik, Container-Anhänge | L | 2 | Stego-Sniff | Verdacht, keine Extraktion beliebiger Payloads als Feature-Pitch | offen |
| forensics-reencode | Re-Encode-Generationen | forensics | Quantisierungs-Artefakte, EL | L | 2 | Re-Encode-Generationen | Schätzung, kein Gerichtsgutachten | offen |
| forensics-visual-diff | Visueller Diff | forensics | Pixel-Diff, SSIM | M | 2 | visueller Diff | Überlappt `pdf-compare` Preset `pixel`; Bilder + gerenderte PDF-Seiten | offen |
| forensics-pii-report | PII- / Spuren-Report | forensics | Tesseract, NER, EXIF, Fonts | L | 2 | Gesichter/Texte/GPS/Fonts/Drucker-Codes Report | Kein biometrisches Matching-Netz über das hinaus, was lokal für Boxen nötig ist | offen |
| forensics-network | Network-Beweis-Paket | forensics | HAR-Parser (lokal), Hash | M | 5 | Network-Beweis | Nur lokale HAR/PCAP-Metadaten; kein Mitschnitt | offen |
| forensics-audit-pdf | Audit-Report PDF | forensics | pdf-lib | M | 2 | Audit-Report PDF; Audit-Log (Export) | Fasst Verifikation + Provenance + Share-Safe zusammen | offen |

---

## Pack `image` — `packages/tools-image`

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| image-convert | Bild konvertieren | image | jSquash, heic-decode, UTIF, eigener SVG/ICO-Pfad | L | 2 | Bildkonverter; HEIC→JPG; TIFF lesen/schreiben; JXL; APNG; TGA; PPM/PGM/PBM; ICO; BMP; GIF; WEBP; AVIF | **Formate Welle 2:** JPG, PNG, WEBP, AVIF, GIF, BMP, TIFF, ICO, HEIC, SVG, TGA, PPM, PGM, PBM, APNG, JXL. **Nicht hier:** PSD, EXR, DDS, XWD, JPEG 2000 → Exotik | ✅ umgesetzt |
| image-compress | Bild komprimieren | image | jSquash (mozjpeg/oxipng/avif/webp/jxl) | M | 2 | Komprimieren; kleiner ohne Schärfeverlust | Preset `visuell-lossless`: SSIM-Schleife | ✅ umgesetzt |
| image-resize | Skalieren | image | Canvas / jSquash | S | 2 | Skalieren Pixel/Prozent, Bulk | Lanczos | ✅ umgesetzt |
| image-rotate-flip | Drehen / Spiegeln | image | Canvas | S | 2 | Drehen/Spiegeln | EXIF-Orientation korrigieren | ✅ umgesetzt |
| image-crop | Zuschneiden | image | Canvas | S | 2 | Zuschneiden | Seitenverhältnis-Presets | ✅ umgesetzt |
| image-adjust | Anpassen | image | Canvas/WebGL | S | 2 | Helligkeit, Kontrast, Sättigung | Histogram-Preview | ✅ umgesetzt |
| image-watermark | Wasserzeichen (Bild) | image | Canvas | M | 2 | Wasserzeichen | Text/Bild; kein Entfernen | ✅ umgesetzt |
| image-bg-remove | Hintergrund entfernen | image | ONNX Runtime Web (u2net/modnet lokal) | L | 2 | Hintergrund entfernen | Modell selbst gehostet; WebGPU | offen |
| image-metadata | Metadaten lesen / editieren / entfernen | image | ExifParser, piexif-artig (eigen) | M | 2 | Metadaten entfernen; EXIF/IPTC/GPS lesen/editieren | Presets: `strip-all`, `strip-gps`, `edit` | ✅ umgesetzt |
| image-redact | Bild redigieren | image | Canvas | M | 2 | Bild redigieren (Boxen) | Boxen + Verifikation | ✅ umgesetzt |
| image-compare | Zwei Bilder vergleichen | image | Pixel-Diff, SSIM, Slider | M | 2 | zwei Bilder vergleichen | | ✅ umgesetzt |
| image-to-animation | Bilder → GIF / Video / Slideshow | image | gifenc, ffmpeg.wasm, WebCodecs | M | 2 | Bilder→GIF/Video/Slideshow; Zeitraffer aus Serie (Standbilder) | Video-Ausgabe in Phase 3 an FFmpeg koppeln | ✅ umgesetzt |
| image-doc-repair | Dokument-Foto reparieren | image | OpenCV.js (lazy), Tesseract.js | L | 2 | Dokumentenscanner; Whiteboard-Foto; Perspektiv-Entzerren; Kinderzeichnung aufhellen; Moire entfernen; Handschrift-Notiz; Whiteboard→PNG+OCR | Presets: `scanner`, `whiteboard`, `kinderzeichnung`, `moire`, `notiz-ocr` | ✅ umgesetzt |
| image-screenshot-studio | Screenshot-Werkstatt | image | Canvas, Clipboard API, EXIF, Heuristik | L | 2 | Screenshot-Wäscher; Clipboard-Sanitizer; Leak-Check; Device-Mockup; App-Store-Rahmen; Long-Screenshot; Screenshot-vs-Foto; Ausweis-Screenshot-Warnung | Presets: `wash`, `clipboard`, `leak`, `mockup`, `store-frame`, `long`, `photo-vs-screenshot`, `id-warn` | offen |
| image-auto-blur | Gesicht / Kennzeichen unscharf | image | ONNX (lokal), Canvas | L | 2 | Gesicht/Kennzeichen automatisch unscharf | Danach Verifikation; kein Cloud-API | ✅ umgesetzt |
| image-burst-pick | Burst → bestes Bild | image | Schärfe/Belichtung-Score | M | 2 | Burst→bestes Bild | | offen |
| image-livephoto | Live Photo / Motion Photo | image | HEIC/MP4-Container, ffmpeg.wasm (Phase 3 für Video) | M | 2 | Live Photo zerlegen; Live Photo↔Motion Photo | Still + Video + Pair | offen |
| image-filmscan | Filmscan-Kit | image | Canvas, LUT, Staub-Heuristik | L | 2 | Filmscan-Kit | Invert, Crop Sprocket, Color | offen |
| image-color-match | Farblook kopieren | image | Histogram-Match / 3D-LUT ableiten | M | 2 | Farblook kopieren | | offen |
| image-passphoto | Passbild-Schneider | image | Canvas, Gesicht-BBox | M | 2 | Passbild DE/EU/US; Ausweisfoto-Maße | Presets: DE, EU, US | offen |
| image-redeye | Rote Augen | image | Canvas | S | 2 | Rote-Augen | | offen |
| image-lineart | Foto → Line-Art / Malbuch | image | Canvas, Kanten | M | 2 | Foto→Line-Art/Malbuch | | offen |
| image-pixelart | Foto → Pixel-Art | image | Canvas | S | 2 | Foto→Pixel-Art | Palette, Skala | offen |
| image-svg-hatch | Foto → SVG / Hatch | image | Potrace-WASM o. eigen, Plotter-Pfade | L | 2 | Foto→SVG/Hatch für Plotter | | offen |
| image-logo-svg | PNG-Logo → SVG | image | Potrace-WASM | L | 2 | PNG-Logo→SVG | | offen |
| image-sticker-crop | Kreis-Crop / Sticker | image | Canvas | S | 2 | Kreis-Crop/Sticker | | offen |
| image-meme | Meme-Formate | image | Canvas | S | 2 | Meme in allen Seitenverhältnissen | Safe-Zone-Overlay | offen |
| image-cinemagraph | Cinemagraph | image | ffmpeg.wasm / WebCodecs | L | 3 | Cinemagraph | Maske + Loop; hängt an Video-Kern | offen |
| image-collage | Collage | image | Canvas | M | 2 | Collage | Raster-Presets | offen |
| image-polaroid | Polaroid / Filmstreifen | image | Canvas | S | 2 | Polaroid/Filmstreifen | | offen |
| image-palette | Farbpalette + Brand-Farben | image | k-means, WCAG-Kontrast | M | 2 | Farbpalette+Brand-Kit (HEX/HSL+WCAG) | Export HEX/HSL/CSS; WCAG-Paare | ✅ umgesetzt |
| image-dominant-css | Dominant Colors → CSS/Tailwind | image | image-palette API | S | 2 | Dominant Colors→CSS/Tailwind | | offen |
| image-lut | 3D-LUT / Film-Look | image | LUT-Parser, WebGL | M | 2 | 3D-LUT/Film-Look; Log→Rec.709 (nur LUT-Preset) | Preset `log-rec709` ist eine LUT, kein eigener Tone-Mapper | ✅ umgesetzt |
| image-scopes | Scopes | image | WebGL | L | 2 | Histogram, Waveform, Vectorscope, Zebras, False Color | Analyse, kein Render-Export nötig | ✅ umgesetzt |
| image-heic-depth | Portrait-HEIC Depth-Map | image | heic-decode | M | 2 | Portrait-HEIC Depth-Map | **Nur extrahieren**, nicht Depth schätzen | offen |
| image-movie-barcode | Movie-Barcode | image | Frame-Sample (Phase 3: ffmpeg) | S | 3 | Movie-Barcode | Mittelstreifen über Zeit | offen |
| image-storyboard | Storyboard-PDF | image | pdf-lib, Thumbnails | M | 3 | Storyboard-PDF | | offen |
| image-geotag-gpx | Geotag → GPX/KML | image | EXIF-GPS | S | 2 | Geotag→GPX/KML | | offen |
| image-exif-batch | EXIF-Stapel | image | image-metadata | M | 2 | Zeitzone in EXIF; Rename nach EXIF; Sortieren nach Datum/Kamera | Presets: `tz`, `rename`, `sort` | ✅ umgesetzt |
| image-spritesheet | Sprite-Sheet / Atlas | image | Canvas, JSON/Hash | M | 2 | Sprite-Sheet; Texture-Atlas; packen/entpacken | | offen |
| image-colorblind | Farbblind-Simulator + Daltonize | image | Canvas-Matrizen | M | 2 | Farbblind-Simulator+Daltonize | Von a11y mitgenutzt | ✅ umgesetzt |
| image-broadcast-legal | Broadcast-Legalizer | image | YUV-Clamp | M | 3 | Broadcast-Legalizer | Video-Frames in Phase 3 | offen |
| image-hdr-tonemap | HDR ↔ SDR Tonemap | image | WebGL, Gain Map | L | 2 | HDR↔SDR Tonemap | | ✅ umgesetzt |
| image-icc | Farbmanagement / ICC | image | littlecms-WASM o. Browser-Color | M | 2 | ICC anwenden/entfernen; Farbmanagement | | ✅ umgesetzt |
| image-ascii | Bild → ASCII / Braille | image | Canvas | S | 2 | Bild→ASCII/Braille | | ✅ umgesetzt |
| image-seamless | Nahtlose Textur | image | Overlap/Blend | M | 2 | nahtlose Textur | | offen |
| image-normalmap | Normal Map | image | Sobel | M | 2 | Normal Map | | offen |
| image-animated | Animiertes AVIF / WebP | image | jSquash, gif-Demux | M | 2 | animiertes AVIF/WebP | | offen |
| image-format-shootout | Format-Shootout | image | image-convert + SSIM/Größe | M | 2 | Format-Shootout | Tabelle Größe/Qualität je Codec | offen |
| image-superres | Super-Resolution (Showcase) | image | ONNX / Transformers.js | L | 5 | Super-Resolution | **Ein** Showcase, kein Produktversprechen | offen |
| image-denoise | Denoise (Showcase) | image | ONNX | L | 5 | Denoise | **Ein** Showcase; nicht „Studio-Restorer“ | ✅ umgesetzt |

---

## Pack `creator` — bis Phase 2 in `tools-image`, ab Phase 5 eigenes Pack

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| creator-export-pack | Export-Pack | creator | image-convert, image-resize | L | 2 | Favicon-Pack; Apple-Touch; App-Icon-Set; App-Icon maskable; OG-Card; OG/Social-Card; Web-Pack 1×/2× AVIF+WebP; Print-Pack 300dpi; Social-Pack; Platform-Pack; Brand-Kit (Export); Produktfoto-Pack; Favicon/App-Icon-Satz (7.3); Safe Zones; Größen-Deckel; Spec-Presets (Teil Größen) | Preset-Bibliothek: `favicon`, `apple-touch`, `appicon-maskable`, `og`, `web-1x2x`, `print-300`, `social`, `platform`, `brand-kit`, `produktfoto`, `safe-zone`. Eine Pipeline, viele Manifest-JSONs | ✅ umgesetzt |
| creator-spec-check | Spec Check / Plattform-Limits | creator | Format-Wissensbasis | M | 2 | Spec Check; Plattform-Limits; Spec-Presets (WhatsApp, Instagram, TikTok, Shorts, Discord, E-Mail 25 MB) | Liest `format-kb`; gilt für Bild+Video (Video-Checks Phase 3) | ✅ umgesetzt |
| creator-sticker-set | Sticker-Set | creator | image-sticker-crop, image-convert | M | 2 | Telegram/WhatsApp-Sticker-Set; Sticker-Set (7.13) | Pack-Export + Größenregeln | ✅ umgesetzt |
| creator-thumbnail | Thumbnail-Fabrik | creator | Canvas, optional ffmpeg | M | 3 | Thumbnail-Fabrik | Titel, Safe Zone, Varianten | offen |
| creator-contact-sheet | Kontaktbogen | creator | Canvas, pdf-lib | M | 3 | Kontaktbogen; Contact Sheet (Video) | Bild- oder Video-Frames | ✅ umgesetzt |
| creator-brand-batch | Brand-Kit auf Ordner | creator | Pipeline + Team-Presets | M | 5 | Brand-Kit Batch; Brand-Kit auf Ordner | Wasserzeichen, LUT, End slate, Dateinamen | offen |

---

## Pack `media` — `packages/tools-media` (Video-Kern)

Einfache Filter sind **keine** eigenen Tools. Sie hängen als Preset am Kern (`video-convert`, `video-edit`, `audio-convert`, `audio-edit`). Umsetzungsspalte dann: `FFmpeg-Preset → <kern>`.

### Video-Kern-Tools

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| video-convert | Video konvertieren | media | ffmpeg.wasm LGPL, mp4box.js, mp4-muxer, WebCodecs (H.264) | L | 3 | Videokonverter (MP4, WEBM, MKV, MOV, AVI, FLV, OGV, 3GP, MPG, TS, WMV, GIF, VOB, ASF, RM, DIVX, F4V, MXF, OGM, DV, M2V, SVI, NUT, Y4M) | Kein x264/x265 im WASM. H.264-Encode: WebCodecs wo vorhanden, sonst VP9/AV1/MPEG-4-soft. RM/WMV/MXF: Best-effort Decode | ✅ umgesetzt |
| video-edit | Video-Filterkern | media | ffmpeg.wasm Filtergraph | M | 3 | (Preset-Träger) | Träger aller `FFmpeg-Preset → video-edit` | ✅ umgesetzt |
| video-compress | Video komprimieren | media | ffmpeg.wasm, WebCodecs, Binärsuche | M | 3 | Komprimieren | CRF/Bitrate; koppelt `media-fit` | ✅ umgesetzt |
| media-fit | Make it fit | media | Binärsuche Bitrate/Auflösung | L | 3 | Make it fit (Zielgröße MB) | Bild Phase 2 über image-compress; Video hier | offen |
| video-trim | Trimmen | media | ffmpeg.wasm, mp4box (keyframe) | S | 3 | Trimmen | Stream-Copy wenn möglich | ✅ umgesetzt |
| video-concat | Aneinanderhängen | media | ffmpeg.wasm | S | 3 | Aneinanderhängen | Re-Encode wenn inkompatibel | offen |
| video-split | Splitten | media | ffmpeg.wasm | S | 3 | Splitten | Zeit oder Szenen (Scene-Detect optional) | ✅ umgesetzt |
| video-replace-audio | Audio ersetzen | media | ffmpeg.wasm, mp4box | S | 3 | Audio ersetzen | | ✅ umgesetzt |
| video-watermark | Wasserzeichen (Video) | media | ffmpeg.wasm overlay | M | 3 | Wasserzeichen | | ✅ umgesetzt |
| video-subtitles | Untertitel (ohne Sprache) | media | ffmpeg.wasm, eigener SRT/VTT-Parser | M | 3 | einbrennen; extrahieren; konvertieren; resyncen | Sprache/Whisper → speech-*. Soft-Subs Preset | offen |
| video-to-gif | Video → GIF | media | ffmpeg.wasm, Palette-Filter | M | 3 | Video→GIF; GIF intelligente Palette | Preset `smart-palette` | ✅ umgesetzt |
| gif-to-video | GIF → Video | media | ffmpeg.wasm | S | 3 | GIF→Video | | ✅ umgesetzt |
| video-extract-audio | Audio aus Video | media | ffmpeg.wasm, mp4box | S | 3 | Audio aus Video; alle Audiospuren extrahieren (Preset) | Preset `all-tracks` | offen |
| video-extract-frames | Standbilder aus Video | media | ffmpeg.wasm | S | 3 | Standbilder; Video→Einzelbilder | fps / Zeitliste | offen |
| video-unpack | Video entpacken | media | ffmpeg.wasm, mp4box | M | 3 | Video entpacken; Remux (Teil) | Streams als Dateien | ✅ umgesetzt |
| video-remux | Remux | media | mp4box, ffmpeg -c copy | S | 3 | Remux | Ohne Re-Encode | ✅ umgesetzt |
| video-repair | Defektes Video reparieren | media | ffmpeg.wasm, mp4box | L | 3 | Defektes Video reparieren | Moov-Repair, Index | ✅ umgesetzt |
| video-screen-clean | Screenrecording aufräumen | media | video-edit Presets + Crop | M | 3 | Screenrecording aufräumen | Cursor-Ruckler, Letterbox, Mono | offen |
| video-restore | Altes Video restaurieren | media | ffmpeg Filter, optionales Showcase-Denoise | L | 3 | Altes Video restaurieren; dunkle Aufnahme aufhellen/entrauschen | Presets: `brighten`, `denoise-light` — kein Wunder-Restore | ✅ umgesetzt |
| video-chroma-key | Chroma-Key | media | ffmpeg colorkey/chromakey | M | 3 | Chroma-Key | | ✅ umgesetzt |
| video-screen-demo | Screen-Demo | media | Cursor-Track optional, ffmpeg zoompan | XL | 5 | Screen-Demo (Klick-Zoom, Cursor, Tastenkürzel, Passwortfeld piepen) | Phase 5; Piep = Audio-Gate | offen |
| video-proxy | Proxy Premiere / Resolve | media | ffmpeg Presets | M | 3 | Proxy für Premiere/Resolve | ProRes nicht im LGPL-WASM; DNxHR/OffSpeed/MP4-Proxy | offen |
| video-pip | PiP-Layout | media | ffmpeg overlay | M | 3 | PiP-Layout | | ✅ umgesetzt |
| video-podcast | Podcast-Video | media | Waveform + Still + ffmpeg | M | 3 | Podcast-Video | | offen |
| video-before-after | Before/After-Slider | media | Canvas + zwei Videos / Split-Screen | M | 3 | Before/After-Slider | Export: Split oder interaktives WebM | offen |
| video-stabilize | Stabilisierung | media | ffmpeg vidstab (wenn im LGPL-Build) sonst Eigen-2D | L | 3 | Stabilization | Build-Flag dokumentieren | offen |
| video-scene-detect | Scene-Detect | media | ffmpeg select/scenedetect | M | 3 | Scene-Detect; Schwarzbild/Freeze/Clipping erkennen (Preset) | Presets: `cut`, `black`, `freeze`, `clip` | offen |
| video-find-frame | Frame wie Referenz | media | Perceptual Hash je Frame | M | 3 | Frame wie Referenzbild finden | | offen |
| video-intro-outro | Intro / Outro / Lower-Thirds | media | ffmpeg overlay, CSV | M | 3 | Intro/Outro/Lower-Thirds aus CSV; End slate/Countdown | Presets: `slate`, `countdown` | offen |
| video-mkv-autopsy | MKV-Autopsy | media | mkv-Parser, forensics-autopsy | M | 3 | MKV-Autopsy | Spuren, Kapitel, Attachments | offen |
| video-360 | 360-Video reframen | media | ffmpeg v360 | L | 5 | 360-Video reframen | | offen |
| video-hdr | HDR-Metadaten / HDR→SDR | media | ffmpeg zscale/tonemap, mp4box | M | 3 | HDR→SDR; HDR-Metadaten strip/add; Color-Range-Flag-Fix | Presets: `tonemap`, `strip`, `add`, `range-fix` | offen |
| video-chapters | Kapitel in MP4 | media | mp4box | S | 3 | Kapitel in MP4 | | ✅ umgesetzt |
| video-cover-art | Cover-Art (Video) | media | mp4box, ffmpeg | S | 3 | Cover-Art | | offen |
| video-audio-mix | Mehrkanal / Dual-Audio | media | ffmpeg pan/amerge | M | 3 | 5.1→Stereo/Upmix; Dual-Audio | Presets: `51-stereo`, `upmix`, `dual` | offen |
| video-loop | Loop nahtlos | media | ffmpeg | S | 3 | Loop nahtlos | Crossfade-Ende | ✅ umgesetzt |
| video-ad-draft | Audiodeskription-Entwurf | media | speech-transcribe + LLM-Vorlage | L | 4 | Audiodeskription-Entwurf | Pack a11y nutzt dasselbe Tool | offen |
| video-silence-cut | Stille entfernen (Video) | media | ffmpeg silencedetect **oder** Whisper-VAD | M | 3 | Stille entfernen | Phase 3: Pegel. Phase 4: Whisper-VAD als Option | offen |
| video-jumpcut | Jump-Cut-Editor | media | speech-transcribe + Schnittliste | L | 4 | Jump-Cut-Editor; Whisper→Jump-Cut; Füllwörter-Cutter | Presets: `silence`, `filler`, `whisper` | offen |
| video-auto-chapters | Auto-Kapitel | media | Transformers.js / Whisper-Segmente | L | 4 | Auto-Kapitel | | offen |
| video-highlight | Highlight-Reel | media | Energie + Transcript-Keywords | L | 4 | Highlight-Reel | | offen |
| video-reframe | Talking-Head Smart-Reframe 9:16 | media | ONNX Face/Person, ffmpeg crop | L | 4 | Talking-Head Smart-Reframe | | offen |
| video-ocr-subs | Eingebrannte Untertitel → SRT | media | Tesseract.js auf Frames | L | 4 | OCR auf Frames; eingebrannte Untertitel per OCR→SRT | | offen |
| video-lyric | Lyric-Video / Karaoke | media | SRT-Timing + ffmpeg | L | 4 | Lyric-Video; Karaoke (Video) | | offen |
| video-audiogram | Audiogramm | media | Waveform + Capsule-Still | M | 4 | Audiogramm | | offen |
| video-meeting | Meeting-Recording aufbereiten | media | Szenen + Transcript | L | 4 | Meeting-Recording Folienwechsel+Kapitel; Zoom-Recording splitten | Presets: `slides`, `zoom-split` | offen |
| video-meme-captions | Meme-Captions Wort für Wort | media | Whisper-Word-Timestamps, ffmpeg drawtext | M | 4 | Meme-Captions Wort für Wort | | offen |
| video-edl | EDL / Marker aus Transkript | media | EDL/XML-Writer | M | 4 | EDL/Marker aus Transkript | | offen |
| video-swear-beep | Fluchen piepen | media | Wortliste + Whisper + beep | M | 4 | Fluchen piepen; Schimpfwort-Piep | a11y/Kindersicherung nutzt Preset | offen |
| video-sign-friendly | Gebärdenfreundlich | media | Crop/Safe-Area, Tempo | M | 4 | gebärdenfreundlich | Kein Avatar-Generator | offen |
| video-epilepsy | Epilepsie-Check | media | Flash-Frequenz, Flächenwechsel | M | 3 | Epilepsie-Check | Warnreport, keine „Heilung“ | offen |

### FFmpeg-Presets (Video) — keine eigenen Tools

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| preset-video-mute | Stumm | media | FFmpeg-Preset → video-edit | S | 3 | Stumm | `-an` / volume=0 | ✅ als `video-mute` |
| preset-video-scale | Skalieren | media | FFmpeg-Preset → video-edit | S | 3 | Skalieren | scale= | ✅ Preset in `video-edit` |
| preset-video-crop | Croppen | media | FFmpeg-Preset → video-edit | S | 3 | Croppen; Letterbox croppen; Letterbox vs. Crop | Presets: `manual`, `letterbox-detect` | ✅ als `video-crop` |
| preset-video-reverse | Rückwärts | media | FFmpeg-Preset → video-edit | S | 3 | Rückwärts | | ✅ als `video-reverse` |
| preset-video-boomerang | Boomerang | media | FFmpeg-Preset → video-edit | S | 3 | Boomerang | reverse+concat | ✅ als `video-boomerang` |
| preset-video-speed | Tempo | media | FFmpeg-Preset → video-edit | S | 3 | Tempo; Framerate-Wandel ohne Chipmunk | `setpts` + `atempo`; Kette für große Faktoren | ✅ als `video-speed` |
| preset-video-brighten | Aufhellen | media | FFmpeg-Preset → video-edit | S | 3 | dunkle Aufnahme aufhellen | eq/curves | ✅ Preset in `video-edit` |
| preset-video-denoise-hq | Entrauschen (Filter) | media | FFmpeg-Preset → video-edit | S | 3 | entrauschen | hqdn3d/nlmeans wenn im Build | ✅ Preset in `video-edit` |
| preset-video-vfr-cfr | VFR → CFR | media | FFmpeg-Preset → video-convert | S | 3 | VFR→CFR | fps= | ✅ Preset in `video-convert` |
| preset-video-rotation | Rotation-Flag vs. Pixel | media | FFmpeg-Preset → video-convert | S | 3 | Rotation-Flag vs. Pixel | transpose vs. metadata | ✅ Preset in `video-convert` |
| preset-video-fps | Framerate setzen | media | FFmpeg-Preset → video-convert | S | 3 | Framerate-Wandel | | ✅ als `video-fps` |
| preset-video-gif-palette | GIF Palette | media | FFmpeg-Preset → video-to-gif | S | 3 | GIF intelligente Palette | palettegen/paletteuse | ✅ Preset in `video-to-gif` |

---

## Pack `media` — Audio-Kern

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| audio-convert | Audio konvertieren | media | ffmpeg.wasm LGPL | L | 3 | Audiokonverter (MP3, WAV, M4A, OGG, OPUS, FLAC, AIFF, WMA, AC3, AMR, APE, MPC, RA, TTA, WV, AU, CAF, GSM, DTS, MKA) | Encode-Set an LGPL-Build binden; WMA/APE/DTS Decode best-effort | ✅ umgesetzt |
| audio-edit | Audio-Filterkern | media | ffmpeg.wasm Filtergraph | M | 3 | (Preset-Träger) | Träger der Audio-FFmpeg-Presets | ✅ umgesetzt |
| audio-normalize | Lautheit normalisieren | media | ffmpeg loudnorm | M | 3 | Lautheit normalisieren; Album-Normalisierung; ReplayGain | Presets: `ebu-r128`, `album`, `replaygain` | ✅ umgesetzt |
| audio-join | Zusammenfügen | media | ffmpeg concat | S | 3 | Join; Gapless Join | Preset `gapless` | ✅ umgesetzt |
| audio-trim | Trim | media | ffmpeg | S | 3 | Trim | | ✅ umgesetzt |
| audio-split | Split | media | ffmpeg | S | 3 | Split; CUE-Split (Preset) | Preset `cue` → audio-cue | ✅ umgesetzt |
| audio-silence-remove | Stille entfernen | media | silencedetect | M | 3 | Stille entfernen | | offen |
| audio-stems | Gesang / Backing / Stems | media | ONNX (Demucs-artig) lokal, WebGPU | XL | 4 | Gesang/Backing trennen; Stems | Großes Modell; Cache Storage | ✅ umgesetzt |
| audio-key | Tonart | media | Analyse (essentia-WASM o. eigen) | M | 3 | Tonart | | offen |
| audio-anonymize | Stimme anonymisieren | media | ffmpeg + Pitch/Formant, optional Vocoder | L | 3 | Stimme anonymisieren | Kein „unumkehrbar“-Claim | offen |
| audio-interview | Interview auf zwei Spuren | media | ffmpeg channelsplit / Dual-Mono | M | 3 | Interview auf zwei Spuren | | offen |
| audio-ebu-report | EBU R128 Report | media | ffmpeg loudnorm print | M | 3 | EBU R128 Report | Nur Messung | offen |
| audio-cleanup | De-Esser / Plosive / Atem-Gate | media | ffmpeg + Eigenfilter | M | 3 | De-Esser/Plosive/Atem-Gate | Ein Tool, drei Presets | offen |
| audio-cough | Husten-Cutter + Roomtone | media | Klassifikator lokal oder Peak+Spektrum | L | 4 | Husten-Cutter+Roomtone | Roomtone aus Lücken | offen |
| audio-roomtone | Roomtone loopen | media | Loop-Finder | S | 3 | Roomtone loopen | | offen |
| audio-audiobook | Audiobook-Kapitel | media | Stille + Kapitel-UI | M | 3 | Audiobook-Kapitel | | offen |
| audio-chopper | Sample-Chopper | media | WebAudio | M | 3 | Sample-Chopper | | offen |
| audio-loop-find | Loop-Punkt-Finder | media | Autokorrelation | M | 3 | Loop-Punkt-Finder | | offen |
| audio-bpm | BPM / Downbeat | media | Analyse | M | 3 | BPM/Downbeat | | offen |
| audio-practice | Practice-Player | media | WebAudio | M | 3 | Practice-Player | Tempo ohne Tonart-Shift, Loop, Cue | offen |
| audio-vinyl | Vinyl / Kassette restaurieren | media | ffmpeg + Click-Removal | L | 3 | Vinyl/Kassette-Restauration | | offen |
| audio-target-eq | Ziel-Entzerrung | media | EQ-Presets | M | 3 | Ziel-Entzerrung (Telefon/Radio/Club) | | offen |
| audio-ducking | Ducking | media | sidechain / WebAudio | M | 3 | Ducking (7.8 + 7.15) | | ✅ umgesetzt |
| audio-fingerprint | Lokaler Fingerprint | media | Chromaprint-WASM o. eigen | L | 5 | lokaler Fingerprint | Nur lokal, keine AcousticID-Cloud | offen |
| audio-click-track | Click-Track / Stimmton | media | Oscillator | S | 3 | Click-Track/Stimmton | | ✅ umgesetzt |
| audio-waveform-poster | Waveform-Poster | media | Canvas | S | 3 | Waveform-Poster | | ✅ umgesetzt |
| audio-spectrogram | Spectrogram | media | FFT, Canvas | S | 3 | Spectrogram | | ✅ umgesetzt |
| audio-ringtone | Ringtone / M4R | media | audio-convert Preset | S | 3 | Ringtone/M4R | AAC + Länge | ✅ umgesetzt |
| audio-limiter | True-Peak-Limiter / DC-Offset | media | ffmpeg alimiter, dcshift | S | 3 | True-Peak-Limiter/DC-Offset | | offen |
| audio-cue | CUE-Split | media | CUE-Parser + ffmpeg | S | 3 | CUE-Split | | offen |
| audio-id3 | Cover-Art / ID3 | media | ID3-Writer | S | 3 | Cover-Art ID3 | | offen |
| audio-tempo-match | Sprecher-Tempo angleichen | media | Whisper-Segmente + atempo | L | 4 | Sprecher-Tempo angleichen | | offen |
| audio-spatial | Spatial flatten / Center weg | media | ffmpeg pan | M | 3 | Spatial flatten; Center-Kanal entfernen | Presets: `flatten`, `no-center` | offen |
| audio-resample | Sample-Rate / Bit-Depth / Dither | media | ffmpeg | S | 3 | Sample-Rate/Bit-Depth Dither | | offen |
| audio-playlist-xfade | Playlist Crossfade | media | ffmpeg acrossfade | M | 3 | Playlist Crossfade | | offen |
| audio-voice-note | WhatsApp Voice Note | media | audio-convert Preset (OGG/OPUS) | S | 3 | WhatsApp-Voice-Note | | offen |
| audio-voice-memos | Apple Voice Memos | media | M4A + Kapitel | S | 3 | Apple Voice Memos | | offen |
| audio-diarize | Diarization / Sprecher extrahieren | media | Transformers.js | L | 4 | Diarization Sprecher extrahieren | | offen |
| audio-podcast-factory | Podcast-Fabrik | media | Pipeline: normalize, ducking, silence, ID3 | L | 4 | Podcast-Fabrik | | offen |
| audio-karaoke | Karaoke (Audio) | media | stems + lyrics timing | L | 4 | Karaoke | | offen |

### FFmpeg-Presets (Audio)

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| preset-audio-stereo-mono | Stereo → Mono | media | FFmpeg-Preset → audio-edit | S | 3 | Stereo→Mono | | ✅ Preset in `audio-edit` |
| preset-audio-volume | Lautstärke | media | FFmpeg-Preset → audio-edit | S | 3 | Lautstärke | | ✅ als `audio-volume` |
| preset-audio-fade | Fade | media | FFmpeg-Preset → audio-edit | S | 3 | Fade | | ✅ als `audio-fade` |
| preset-audio-midside | Mid/Side | media | FFmpeg-Preset → audio-edit | S | 3 | Mid/Side | | ✅ Preset in `audio-edit` |
| preset-audio-replaygain | ReplayGain | media | FFmpeg-Preset → audio-normalize | S | 3 | ReplayGain | | ✅ als `audio-replaygain` |
| preset-audio-gapless | Gapless Join | media | FFmpeg-Preset → audio-join | S | 3 | Gapless Join | | ✅ Preset in `audio-join` |

---

## Pack `speech` — `packages/tools-speech`

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| speech-transcribe | Transkribieren (Whisper) | speech | Transformers.js v3, ONNX Runtime Web, WebGPU | XL | 4 | Whisper tiny.en; mehrsprachig; größere Modelle; Untertitel+Text+Sprechertrennung | Optionen: Modellgröße, Sprache, Word-Timestamps, Diarization-Flag | ✅ umgesetzt |
| speech-subtitle-edit | Untertitel verschieben / snappen | speech | SRT/VTT-Parser | M | 4 | verschieben; an Lücken snappen | | offen |
| speech-bilingual | Zweisprachige SRT | speech | speech-translate + Merge | M | 4 | zweisprachige SRT | | offen |
| speech-translate | Lokal übersetzen | speech | Marian/NLLB via Transformers.js | L | 4 | lokal übersetzen (Marian/NLLB) | Modelle selbst hosten | offen |
| speech-ocr-frames | OCR auf Frames | speech | Tesseract.js | L | 4 | OCR auf Frames | Alias/API von video-ocr-subs | offen |
| speech-jumpcut | Whisper → Jump-Cut | speech | speech-transcribe + Schnittliste | L | 4 | Whisper→Jump-Cut | Delegiert an video-jumpcut | offen |
| speech-chat-doc | Chat-with-PDF / Zusammenfassung | speech | WebLLM, pdfjs-dist, Chunking | XL | 4 | lokales LLM; Chat-with-PDF; Zusammenfassung | Nur lokale Modelle; kein Server-LLM | offen |
| speech-meeting-notes | Meeting-Notes | speech | Whisper + WebLLM | L | 4 | Meeting-Notes Whisper+LLM | Action Items, Kapitel | offen |
| speech-tts | TTS (Kokoro) | speech | kokoro-js | L | 4 | (Infrastruktur für a11y/Lyric) | Kein Cloud-TTS | offen |

---

## Pack `office` — `packages/tools-office`

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| office-docx | DOCX ↔ Markdown/HTML/TXT | office | mammoth, docx | M | 4 | DOCX↔Markdown/HTML/TXT | | offen |
| office-xlsx | XLSX ↔ CSV/JSON | office | SheetJS Community **only** | M | 4 | XLSX↔CSV/JSON | Kein SheetJS Pro | offen |
| office-pptx | PPTX → Bilder/PDF | office | JSZip, pdf-lib, Raster | M | 4 | PPTX→Bilder/PDF | Layout best-effort | offen |
| office-markdown | Markdown → PDF/HTML | office | Markdown-Parser, html-to-pdf | M | 4 | Markdown→PDF/HTML | | offen |
| office-html-pdf | HTML → PDF | office | Browser print / eigenes Layout | M | 4 | HTML→PDF | Kein Headless-Chrome-Zwang in WASM; Desktop darf WebView nutzen | offen |
| office-epub | EPUB aufschrauben | office | JSZip, EPUB-Parser | L | 4 | EPUB aufschrauben/Bilder/Fonts/↔PDF/→HTML | Presets: `unpack`, `images`, `fonts`, `to-html`, `to-pdf` | offen |
| office-vcard | Visitenkarte → vCard | office | Tesseract, Parser | M | 4 | Visitenkarte→vCard | | offen |
| office-vcard-merge | vCard mergen | office | vCard-Parser | S | 4 | vCard mergen | | offen |
| office-ics-merge | ICS mergen | office | ics-Parser | S | 4 | ICS mergen | | offen |
| office-data-clean | CSV/JSON/YAML/XML aufräumen | office | Parser, Schema | M | 4 | CSV/JSON/YAML/XML aufräumen | Encoding, Delimiter, Trim | offen |
| office-font-subset | Font-Subset → WOFF2 | office | harfbuzz-WASM / woff2 | L | 4 | Font-Subset→WOFF2 | | offen |
| office-handwriting | Handschrift → Text | office | Tesseract.js / optional CRNN | L | 4 | Handschrift→Text | Überlappt image-doc-repair Preset `notiz-ocr` | offen |
| office-qr | QR / Barcode lesen & erzeugen | office | zxing-wasm | S | 4 | QR/Barcode lesen/erzeugen | | offen |
| office-signature-cutout | Unterschrift freistellen | office | Schwellenwert + Trim | S | 4 | Unterschrift freistellen | | offen |
| office-anki | Anki-Karte | office | APKG/CSV | M | 4 | Anki-Karte | | offen |

---

## Pack `archive` — `packages/tools-archive`

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| archive-create | Archiv erstellen | archive | JSZip, fflate, 7z-wasm / libarchive.js | M | 2 | ZIP/7z/TAR erstellen | | ✅ umgesetzt |
| archive-extract | Archiv entpacken | archive | JSZip, libarchive.js / 7z-wasm | M | 2 | ZIP/7z/TAR entpacken; Einzeldateien ziehen | Preset `pull-selected` | ✅ umgesetzt |
| archive-inspect | Inhalt ansehen | archive | dieselben Parser | S | 2 | Inhalt ansehen | Ohne volles Entpacken | ✅ umgesetzt |
| archive-check | Kaputte Archive prüfen | archive | CRC, Listenversuch | M | 2 | kaputte Archive prüfen | | offen |
| archive-convert | Archivformate wandeln | archive | extract+create | M | 2 | Archivformate wandeln | | ✅ umgesetzt |
| archive-camera-dump | Kamera-Dump entfalten | archive | EXIF, DCIM-Regeln | M | 2 | Kamera-Dump entfalten | | offen |
| archive-rename-date | Nach Datum umbenennen | archive | EXIF/mtime | S | 2 | nach Datum umbenennen | | offen |
| archive-dupes | Duplikate | archive | SHA-256, dHash | M | 2 | Duplikate Hash/perzeptuell | | offen |
| archive-space | Speicherfresser / Platz-Radar | archive | Größenbaum | M | 2 | Speicherfresser; Platz-Radar | | offen |
| archive-sidecar | Sidecar-Wrangler | archive | Namensregeln | M | 2 | Sidecar-Wrangler; Sidecar-Paare JPG+RAW+XMP | RAW-Dateien nur **zuordnen**, nicht entwickeln | offen |
| archive-manifest | SHA-256-Manifest | archive | WebCrypto, JSON/SFV | S | 2 | SHA-256-Manifest | Ordner | offen |
| archive-folder-diff | Ordner vergleichen | archive | Hash-Bäume | M | 2 | Ordner vergleichen | | offen |
| archive-checksum | Checksummen | archive | SHA/MD5/CRC | S | 2 | Checksummen | | offen |

---

## Pack `a11y` — lebt in `pdf` / `image` / `media` / `speech`, Manifest-Flag `pack: a11y`

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| a11y-alt-text | Alt-Text lokal Batch | a11y | Transformers.js Caption, WebLLM | L | 4 | Alt-Text lokal Batch | Nur lokal | offen |
| a11y-easy-read | Leicht-Lesen-Bild | a11y | Caption + Vereinfachung | L | 5 | Leicht-Lesen-Bild | | ✅ umgesetzt |
| a11y-captions-slow | Captions langsamer ohne Overlay | a11y | ffmpeg tempo + soft subs | M | 4 | Captions+langsamer ohne Overlay | | offen |
| a11y-colorblind | (Alias) Farbblind-Simulator | a11y | image-colorblind | S | 2 | Farbblind-Simulator | Kein zweites Binary | offen |
| a11y-swear | (Alias) Schimpfwort-Piep | a11y | video-swear-beep | S | 4 | Schimpfwort-Piep | | offen |
| a11y-audio-desc | (Alias) Audiodeskription | a11y | video-ad-draft | S | 4 | Audiodeskription-Entwurf | | offen |
| a11y-epilepsy | (Alias) Epilepsie-Check | a11y | video-epilepsy | S | 3 | Epilepsie-Check | | offen |
| a11y-kids-subs | Kindersicherung über Untertitel | a11y | Wortliste + Soft-Subs | M | 5 | Kindersicherung über Untertitel | Community-nah; in Phase 5 | offen |

`pdf-ua` bleibt im Pack `pdf`, wird auf der a11y-Hub-Seite gelistet.

---

## Pack `platform` — Engine / Apps (keine Media-Runtime)

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| platform-pipeline | Cross-Media-Pipeline-Builder | platform | Engine-Pipeline, URL-Hash | L | 1 | Tools verketten; Pipeline-Builder; teilbare Links | Config serialisierbar; Share nur Hash, keine Datei | offen |
| platform-folder-convert | Ordner konvertieren | platform | File System Access, Verzeichnisbaum | M | 2 | Ordner konvertieren mit Verzeichnisbaum; alles in Ordner auf Zielformat | | offen |
| platform-error-journal | Fehlerprotokoll | platform | Engine-Error-Log, JSON-Export | S | 1 | Fehlerprotokoll | Pro Datei: Code, Stack, Input-Hash | offen |
| platform-format-kb | Format-Wissensbasis | platform | JSON/YAML-KB → `/formats/`, `/convert/a-to-b`, `/spec/` | L | 1 | Format-Wissensbasis; SEO-Datenquelle | Speist Spec-Check und Presets | offen |
| platform-watch | Ordner-Watch | platform | FSA + CLI `chokidar` | M | 2 | Watchfolder; CLI Watch-Ordner; Ordner-Watch (File System Access) | Zwei Adapter, ein Tool-Job | offen |
| platform-opfs-history | OPFS-Verlauf + Undo | platform | OPFS, IndexedDB-Metadaten | M | 2 | OPFS-Verlauf mit Undo | | offen |
| platform-pwa | PWA-Handler | platform | Web App Manifest | M | 1 | file_handlers; share_target; shortcuts | | offen |
| platform-cli | CLI | platform | Node, Commander/Yargs, gleiche Registry | M | 1 | apps/cli | `run`, `pipeline`, `watch` | offen |
| platform-docker | Docker / White-Label | platform | nginx, branding.json, optionale API | L | 1 | Self-Hosting; White-Label | | offen |
| platform-desktop | Tauri-Gerüst + PDF-Dateizuordnung | platform | Tauri 2 | L | 1 | Desktop-App; .pdf-Dateizuordnung | Reader-Modus = WP, siehe Roadmap | offen |
| platform-desktop-reader | Desktop PDF-Reader-Modus | platform | pdfjs-dist, Tauri fs | XL | 1 | Anzeige, Suche, Kommentare, Formulare, Signatur, Schwärzung, Speichern | Phase-1-Schnitt: Anzeige+Suche+Speichern+Schwärzung. Kommentare Phase 4 | offen |
| platform-rest-api | REST-API Sidecar | platform | Node, gleiche Engine | L | 4 | REST-API im Self-Hosting | Nur Self-Host; keine öffentliche SaaS-Pflicht | offen |
| platform-fulltext | Volltextsuche über Akte | platform | OPFS + SQLite-WASM / FlexSearch | L | 4 | Lokale Volltextsuche | | offen |
| platform-audit-log | Audit-Log lokal | platform | Append-only IDB | M | 4 | Audit-Log lokal | Kein Telemetrie-Kanal | offen |
| platform-extension | Browser-Extension | platform | MV3, teilt Engine wo möglich | L | 5 | Browser-Extension | | offen |
| platform-benchmark | Benchmark-Seite | platform | Vitest-ähnliche Harness im Browser | M | 5 | Benchmark-Seite | WASM/Worker/WebGPU | offen |
| platform-stream-opfs | Video-Streaming über OPFS | platform | Chunked ffmpeg, OPFS | L | 3 | Streaming über OPFS für große Videos | Pflicht für >~1 GB | offen |
| platform-webllm | WebLLM-Runtime | platform | WebLLM, Cache Storage | L | 4 | lokales LLM | Wird von speech-chat-doc genutzt | offen |

---

## Pack `community` — Phase 5+, eigene Plugins

| ID | Titel | Pack | Umsetzung | Aufwand | Phase | Zusammengelegt aus | Notiz | Status |
|---|---|---|---|---|---|---|---|---|
| community-gltf | 3D-lite glTF/OBJ/GLB | community | three.js lazy | L | 5 | 3D-lite glTF/OBJ/GLB | Plugin | offen |
| community-ktx | KTX / Basis | community | basis-transcoder selbst gehostet | M | 5 | KTX/Basis | Plugin | offen |
| community-count | Object / People Count | community | ONNX | L | 5 | Object/People Count | Kein Überwachungs-Pitch; opt-in Plugin | offen |
| community-exotic | Exotik-Formate | community | je Codec | XL | 5 | PSD; EXR; DDS; XWD; JPEG 2000; RAW-Werkstatt | **Nur nach Nutzungsdaten.** RAW entwickeln ≠ Sidecar zuordnen | offen |
| community-games | Spiel-Assets | community | Parser | L | 5 | Spiel-Assets | Ohne ROM-Header-Editor (gestrichen) | offen |

---

## Bewusst ausgelassen

Nicht im Produkt. Keine IDs, keine SEO-Seiten, keine CLI-Commands. Community-Plugin erst ab Phase 5 und nur nach juristischer/Produkt-Freigabe.

| Quellidee | Begründung |
|---|---|
| Wasserzeichen per Inpainting entfernen | Rechtlich heikel (Urheber, Beweismittel). **Erkennung** bleibt (`forensics-watermark-find`) |
| Logo in Ecken entfernen | Dieselbe Inpainting-Klasse |
| Objekt entfernen / Content-Aware Fill | Missbrauch (Beweisfotos), hoher Modellaufwand |
| CLIP-Interrogator | Prompt-Reverse, geringes DACH-Nutzen, Modell-Lizenz/Größe |
| Spielstand- / ROM-Header | Umgehung von Kopierschutz / Game-Assets-Legal |
| Wetterradar entzerren | Nischen-Geo, eigene Projektionssysteme |
| Depth-from-single-image | Unzuverlässig, Showcase-Falle; HEIC-Depth **extrahieren** bleibt |
| Frame-Interpolation / Slow-mo-Interpolation | Qualität vs. Größe; Chipmunk-freie Tempoänderung bleibt als FFmpeg-Preset |
| Anamorphot (De-Squeeze als Produkt) | Nische; Community |
| Log→Rec.709 als eigener Tone-Mapper | Nur LUT-Preset `log-rec709` an `image-lut` / `video-hdr` |
| Haut glätten | Beauty-Filter, kein USP, ethisch unerwünscht |
| Lofi-Version | Gimmick; Ducking/EQ bleiben |
| Multi-Cam-Sync | Editor-Suite, nicht Browser-Tool |
| Focus-Stack | Mikroskop/Macro-Nische |
| Exposure-Blend / HDR-Bracketing | Nische; HDR↔SDR Tonemap bleibt |
| Star-Trail | Astro-Nische |
| Panorama-Stitch | Schwer, patent-/qualitätslastig |
| PSD / EXR / DDS / XWD / JPEG 2000 / RAW-Werkstatt als Kern | → `community-exotic`, Phase 5, nur nach Nutzungsdaten. Super-Resolution und Denoise **nicht** gestrichen, sondern je **ein** Showcase (Phase 5) |
| Zeitraffer-Leute wegmitteln | Inpainting/Median-Stack, Privacy-heikel |
| AGPL-Libs (Ghostscript, MuPDF, iText) | Lizenzverbot, unabhängig von der Feature-Idee |

---

## Zusammenlegungen (Übersicht)

| Ziel | Anzahl Quellen | Quellen |
|---|---|---|
| image-doc-repair | 7 | Dokumentenscanner, Whiteboard-Foto, Perspektiv-Entzerren, Kinderzeichnung aufhellen, Moire, Handschrift-Notiz, Whiteboard→PNG+OCR |
| creator-export-pack | 16 | Favicon-Pack, Apple-Touch, App-Icon-Set, maskable Icons, OG-Card, OG/Social-Card, Web-Pack, Print-Pack, Social-Pack, Platform-Pack, Brand-Kit-Export, Produktfoto-Pack, Favicon-Satz 7.3, Safe Zones, Größen-Deckel, Spec-Größen |
| image-screenshot-studio | 8 | Wäscher, Clipboard-Sanitizer, Leak-Check, Device-Mockup, App-Store-Rahmen, Long-Screenshot, Screenshot-vs-Foto, Ausweis-Screenshot-Warnung |
| image-convert | 16 | JPG, PNG, WEBP, AVIF, GIF, BMP, TIFF, ICO, HEIC, SVG, TGA, PPM, PGM, PBM, APNG, JXL (+ HEIC→JPG, TIFF r/w als Presets) |
| video-convert | 25 | alle gelisteten Video-Container als Formate eines Tools |
| audio-convert | 21 | alle gelisteten Audio-Formate als Formate eines Tools |
| image-metadata | 2 | strip + read/edit |
| image-exif-batch | 3 | TZ, Rename, Sort |
| image-compress | 2 | Komprimieren + visuell lossless |
| pdf-redact | 5 | Redigieren, Klick, Auto-Muster, NER, Verifikation |
| pdf-compare | 2 | PDF-Vergleich, Vertragsvergleich |
| pdf-sign | 2 | Signieren, PAdES/PKCS#12 |
| video-subtitles | 4 | burn, extract, convert, resync |
| audio-stems | 2 | Vocal-Split, Stems |
| audio-cleanup | 3 | De-Esser, Plosive, Atem-Gate |
| audio-normalize | 3 | Lautheit, Album, ReplayGain |
| image-livephoto | 2 | zerlegen, Live↔Motion |
| image-spritesheet | 3 | Sheet, Atlas, pack/unpack |
| image-lut | 2 | LUT/Film-Look + Log→Rec.709-Preset |
| video-hdr | 3 | Tonemap, Meta strip/add, Range-Fix |
| video-scene-detect | 4 | Scene, Schwarz, Freeze, Clipping |
| video-jumpcut | 3 | Jump-Cut, Füllwörter, Whisper-Cut |
| video-meeting | 2 | Folien+Kapitel, Zoom-Split |
| video-audio-mix | 3 | 5.1, Upmix, Dual |
| platform-watch | 3 | Watchfolder, CLI Watch, FSA Watch |
| platform-folder-convert | 2 | Baum konvertieren, Ordner auf Zielformat |
| forensics-share-safe | 2 | „Sicher teilen?“, Share-Pack |
| speech-transcribe | 4 | tiny.en, multilingual, große Modelle, Sprecherflag |
| office-epub | 5 | unpack, Bilder, Fonts, ↔PDF, →HTML |
| archive-extract | 2 | entpacken, Einzeldateien |
| archive-space | 2 | Speicherfresser, Platz-Radar |
| archive-sidecar | 2 | Wrangler, JPG+RAW+XMP |
| image-to-animation | 2 | GIF/Video/Slideshow, Zeitraffer-Serie |
| media FFmpeg-Presets | 18 | mute, scale, crop/letterbox, reverse, boomerang, speed, brighten, denoise-filter, vfr-cfr, rotation, fps, gif-palette, stereo-mono, volume, fade, mid/side, replaygain, gapless |

**Quellideen in Zusammenlegungen:** 7+16+8+16+25+21+2+3+2+5+2+2+4+2+3+3+2+3+2+3+4+3+2+3+3+2+2+4+5+2+2+2+2+18 = **185** (Formate in Converter-Kernen mitgezählt).

**Merge-Gruppen:** 34.

---

## Zähler

Regeln: Alias-Tools (`a11y-colorblind`, `a11y-swear`, `a11y-audio-desc`, `a11y-epilepsy`) zählen **nicht**. FFmpeg-Presets zählen **nicht** als Tools. Community-Plugins separat.

### Tools pro Pack

| Pack | Tools | FFmpeg-Presets | Aliase |
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
| a11y (echte, keine Aliase) | 4 | — | 4 |
| platform | 18 | — | — |
| **Summe ohne Community** | **258** | **18** | **4** |
| community | 5 | — | — |
| **Summe inkl. Community** | **263** | **18** | **4** |

`media` 91 = Video-Kern 51 + Audio-Kern 40 (IDs `video-*` / `gif-to-video` / `media-fit` vs. `audio-*`).

### Tools pro Phase

| Phase | Tools | inkl. Community | Schwerpunkt |
|---|---|---|---|
| 1 | 38 | 38 | Engine-Oberflächen, PDF (17), Privacy/Forensik-Basis (11), DACH-Minimum (2), Platform (8) |
| 2 | 69 | 69 | Bild (45), Archiv (13), Creator-Kern (3), Forensik-Vertiefung (5), Platform (3) |
| 3 | 76 | 76 | FFmpeg Video/Audio + abhängige Bild-/Creator-Tools, OPFS-Streaming |
| 4 | 64 | 64 | Whisper/WebGPU, Office, DACH-Vertiefung, WebLLM, a11y-Kern |
| 5 | 11 | 16 | KI-Showcases, Creator-Batch, Extension, Benchmark, Community (5) |
| **Total** | **258** | **263** | |

Phasenzuordnung = Spalte *Phase* in den Pack-Tabellen.

### Gestrichen / zusammengelegt

| Größe | Zahl |
|---|---|
| Verbindlich gestrichen (Nutzerliste) | **22** (16 Features + 6 Exotik-Formate: PSD, EXR, DDS, XWD, JPEG 2000, RAW-Werkstatt) |
| Analog gestrichen (gleiche Klasse) | **2** (Logo-Inpaint, Zeitraffer-Leute-wegmitteln) |
| Lizenzverbot (kein Feature) | AGPL-Libs |
| Merge-Gruppen | **34** |
| Quellideen in diesen Gruppen | **185** (Converter-Formate mitgezählt) |
| Super-Resolution / Denoise | nicht gestrichen; je **ein** Showcase, Phase 5 |

## Stand nach Welle 5 (2026-09-14)

Spalte **Status** wird aus der Registry (`node apps/cli/dist/cli.js list --json`, 235 Tools) abgeleitet: `✅ umgesetzt` = ID registriert, `✅ als …` = Preset als eigenständiges Tool umgesetzt, `✅ Preset in …` = Kern-Tool registriert, `offen` = nicht umgesetzt oder unter anderer ID (siehe unten).

| Status | Zeilen |
|---|---|
| ✅ umgesetzt | 103 |
| ✅ als eigenes Tool | 9 |
| ✅ Preset im Kern | 9 |
| offen | 164 |

### Registrierte Tools ohne eigene Backlog-Zeile

Diese IDs sind umgesetzt und in Web/CLI/API registriert; sie entstanden aus Zusammenlegungen, Formatkanten (`docx-to-pdf` statt Konverter-Sammelzeile) oder Welle-5-Ergänzungen.

- **a11y** (3): `image-alt-text`, `a11y-sign-friendly`, `a11y-audio-description-draft`
- **archive** (7): `archive-extract-selected`, `archive-test`, `files-camera-dump`, `files-duplicates`, `files-space-radar`, `files-compare-folders`, `files-checksum`
- **creator** (19): `creator-platform-pack`, `creator-thumbnail-factory`, `creator-brand-kit`, `creator-audiogram`, `creator-lyric-video`, `creator-karaoke`, `creator-meme-captions`, `creator-before-after`, `creator-podcast-video`, `creator-intro-outro`, `creator-meme-ratios`, `creator-cinemagraph`, `creator-collage`, `creator-timelapse`, `creator-movie-barcode`, `creator-storyboard-pdf`, `creator-social-card`, `creator-device-mockup`, `creator-sprite-sheet`
- **image** (18): `image-remove-background`, `image-screenshot-workshop`, `image-upscale`, `image-duplicates`, `image-passport`, `image-live-photo`, `image-red-eye`, `image-line-art`, `image-pixel-art`, `image-to-svg`, `image-seamless-texture`, `image-normal-map`, `image-geotag-export`, `image-sort-by-date`, `image-burst-best`, `image-color-transfer`, `image-hidden-layer-check`, `image-film-scan`
- **media** (30): `video-cutlist`, `video-resize`, `video-join`, `video-subtitles-burn`, `video-subtitles-extract`, `video-to-frames`, `video-contact-sheet`, `video-brighten-denoise`, `video-flags`, `video-hdr-to-sdr`, `video-detect`, `video-audio-tracks`, `video-thumbnails`, `video-highlight-reel`, `video-smart-reframe`, `video-360-reframe`, `audio-mono`, `audio-remove-silence`, `audio-bleep`, `audio-eq-presets`, `audio-limiter-dc`, `audio-dither`, `audio-crossfade-playlist`, `audio-mid-side`, `audio-center-remove`, `audio-cover-art`, `audio-voice-notes`, `audio-key-bpm`, `audio-anonymize-voice`, `audio-spatial-flatten`
- **office** (32): `docx-to-pdf`, `docx-to-markdown`, `docx-to-html`, `docx-to-txt`, `markdown-to-docx`, `html-to-docx`, `markdown-to-pdf`, `markdown-to-html`, `html-to-pdf`, `text-to-pdf`, `xlsx-to-csv`, `csv-to-xlsx`, `xlsx-to-json`, `json-to-xlsx`, `xlsx-to-pdf`, `csv-to-pdf`, `pptx-to-pdf`, `pptx-to-images`, `pptx-to-text`, `epub-to-pdf`, `epub-to-html`, `epub-unpack`, `epub-extract-images`, `epub-fix-fonts`, `epub-from-markdown`, `pdf-to-epub`, `data-clean`, `vcard-tools`, `ics-merge`, `font-subset`, `qr-batch`, `anki-from-images`
- **pdf** (4): `pdf-page-numbers`, `pdf-metadata`, `pdf-extract-text`, `pdf-repair`
- **speech** (10): `subtitles-convert`, `subtitles-shift`, `subtitles-snap`, `subtitles-translate`, `subtitles-bilingual`, `transcript-edits`, `transcript-chapters`, `transcript-summary`, `subtitles-ocr`, `audio-profanity-bleep-list`

### Offen nach Welle 5

- `audio-stems` registriert, aber ausgeblendet (kein lizenzsauberes kompaktes Modell).
- Community-Plugin-Loader (`packages/plugins/3d-lite` ist Beispiel-Pack ohne Laufzeit-Loader).
- KI-Showcases (`image-upscale`, `image-denoise`) bleiben Showcases ohne Qualitätsversprechen.
- Exotik-Formate (`community-exotic`) nicht begonnen.
- Alle mit `offen` markierten Zeilen oben.
