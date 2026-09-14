# Pack `image` KI/CV — `@neotools/tools-image-ai`

## Modell-Matrix

| Tool | Modell | Lizenz | Größe | Backend | Runtime-Pfad |
|---|---|---|---|---|---|
| image-remove-background | `u2netp` (U²-Net portable) | Apache-2.0 | 4.57 MB | ORT WebGPU→WASM / Node | `/assets/models/u2netp.onnx` |
| image-remove-background | `isnet-general-q8` (IS-Net general-use, uint8) | Apache-2.0 | 44.4 MB | ORT WebGPU→WASM / Node | `/assets/models/isnet-general-q8.onnx` |
| image-auto-blur (Gesicht) | OpenCV YuNet `face_detection_yunet_2023mar` | Apache-2.0 | 233 KB | ORT | `/assets/models/yunet-face.onnx` |
| image-auto-blur (Person) | Xenova/yolos-tiny | Apache-2.0 | ~25 MB (quant) | Transformers.js, `allowRemoteModels=false` | `/assets/models/yolos-tiny/` |
| image-auto-blur (Kennzeichen) | **kein Netz** — Tesseract-Wortboxen + Kennzeichen-Regex | Apache-2.0 (Tesseract) | — | OCR-lite | — |
| image-upscale | Xenova/swin2SR-lightweight-x2-64 | Apache-2.0 | ~4 MB quant | ORT, Tiling | `/assets/models/swin2sr-x2.onnx` |
| image-denoise | klassisch bilateral / NLM-light | MIT (eigener Code) | — | CPU | immer |
| image-alt-text | Xenova/vit-gpt2-image-captioning | Apache-2.0 | ~98 MB | Transformers.js lokal | `/assets/models/vit-gpt2-caption/` |
| image-alt-text | Xenova/opus-mt-en-de | Apache-2.0 | ~80 MB | Transformers.js lokal | `/assets/models/opus-mt-en-de/` |
| image-doc-repair | klassische CV; OpenCV.js nur lazy (~8 MB, nicht im Repo) | Apache-2.0 falls vorhanden | — | Eigen + optional OpenCV | `/assets/opencv/` (optional) |

Download nur über `scripts/fetch-models.mjs` / `neotools models fetch`. Laufzeit: kein HF/CDN.

## Lizenz-Recherche Gesichter / Kennzeichen

| Kandidat | Befund | Entscheidung |
|---|---|---|
| Ultralytics YOLOv8n-face / yolov8n | AGPL-3.0 Gewichte | **verboten** |
| `keremberke/yolov8n-license-plate` | AGPL (Ultralytics) | **verboten** |
| OpenALPR | AGPL | **verboten** |
| InsightFace SCRFD / RetinaFace | Code oft MIT, **pretrained weights non-commercial** | **verboten** |
| RMBG-1.4 (briaai) | nicht kommerziell frei | **verboten** |
| `onnx-community/ISNet-ONNX` HF-Karte | als AGPL-3.0 markiert | **nicht verwendet** |
| IS-Net official `xuebinqin/DIS` | Apache-2.0 | **ok** (q8-Mirror SacredNoir / x-Liola-x) |
| U²-Net `xuebinqin/U-2-Net` / rembg `u2netp.onnx` | Apache-2.0 | **ok**, Default |
| OpenCV YuNet | Apache-2.0 | **ok**, Gesicht |
| MediaPipe BlazeFace | Apache-2.0 | Slot möglich; YuNet ist kleiner und klar lizenziert |
| Xenova/yolos-tiny, DETR | Apache-2.0 | **ok**, Personen |
| Real-ESRGAN | BSD-3-Clause | lizenz-ok, Swin2SR als kleineres Apache-Default |
| NAFNet | Code MIT; keine kleine, eindeutig freie ONNX-Distribution gefunden | **nur klassisch** |

Kennzeichen: optionales Modell-Slot in der Registry **leer**, bis ein Apache/MIT/BSD-ONNX ohne Ultralytics-Graph existiert.

## Tool-Status

| ID | Status | Ohne Modell | Verify |
|---|---|---|---|
| image-remove-background | implementiert | Batch-Fehler pro Datei, kein Crash | — |
| image-auto-blur | implementiert | Heuristik Gesicht + Platten-Rechtecke + OCR-Regex | Varianz + keine EXIF |
| image-doc-repair | implementiert | volle klassische Pipeline | — |
| image-screenshot-workshop | implementiert | Leak nur mit OCR; Wash/Stitch/Mockup/Score immer | Redact-Modi |
| image-upscale | Showcase | klare Fehlermeldung; optional Bilinear-Flag | — |
| image-denoise | Showcase klassisch | immer | — |
| image-alt-text | implementiert (`pack: a11y`) | Batch-Fehler + CSV-Hinweis; EXIF/XMP über `tools-image` Writer | — |

## Tests

Vitest ohne Modelle: Quad ±2 px, Homographie-Roundtrip, Sauvola, Deskew, Stitch, Secret-Regex, Blur-Verify, Registry-Schema, Tool-Läufe (Denoise/Doc-Repair/Blur/Detect, BG-Remove Fehlerpfad). Modell-Tests `describe.skipIf` wenn `.onnx` fehlt.

## Grenzen

- Raster läuft über `@neotools/tools-image` (`decode`/`encode`/`resample`).
- YuNet-Postprocess akzeptiert `[n,15]`-artige Tensoren; sonst Heuristik.
- OCR-Textlayer in PDF ist unsichtbar, aber vereinfacht (kein volles `writeInvisibleWords`-Layout).
- EXIF `ImageDescription` / XMP schreibt `writeImageDescription` (JPEG/PNG/WebP).
- Super-Resolution / Denoise sind Showcases, kein Qualitätsversprechen.
- OpenCV.js nicht gebündelt (8 MB); lazy no-op wenn Datei fehlt.

## Codecs

`src/raster.ts` ist ein Wrapper um `@neotools/tools-image` und behält die Signatur `decode` / `encode` / `encodePng` / `decodePng` / `resizeBilinear`.
