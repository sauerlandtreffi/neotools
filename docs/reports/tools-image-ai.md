🇬🇧 English · [🇩🇪 Deutsch](./tools-image-ai.de.md)

# Pack `image` AI/CV — `@neotools/tools-image-ai`

## Model matrix

| Tool | Model | License | Size | Backend | Runtime path |
|---|---|---|---|---|---|
| image-remove-background | `u2netp` (U²-Net portable) | Apache-2.0 | 4.57 MB | ORT WebGPU→WASM / Node | `/assets/models/u2netp.onnx` |
| image-remove-background | `isnet-general-q8` (IS-Net general-use, uint8) | Apache-2.0 | 44.4 MB | ORT WebGPU→WASM / Node | `/assets/models/isnet-general-q8.onnx` |
| image-auto-blur (face) | OpenCV YuNet `face_detection_yunet_2023mar` | Apache-2.0 | 233 KB | ORT | `/assets/models/yunet-face.onnx` |
| image-auto-blur (person) | Xenova/yolos-tiny | Apache-2.0 | ~25 MB (quant) | Transformers.js, `allowRemoteModels=false` | `/assets/models/yolos-tiny/` |
| image-auto-blur (license plate) | **no network** — Tesseract word boxes + plate regex | Apache-2.0 (Tesseract) | — | OCR-lite | — |
| image-upscale | Xenova/swin2SR-lightweight-x2-64 | Apache-2.0 | ~4 MB quant | ORT, tiling | `/assets/models/swin2sr-x2.onnx` |
| image-denoise | classic bilateral / NLM-light | MIT (own code) | — | CPU | always |
| image-alt-text | Xenova/vit-gpt2-image-captioning | Apache-2.0 | ~98 MB | Transformers.js local | `/assets/models/vit-gpt2-caption/` |
| image-alt-text | Xenova/opus-mt-en-de | Apache-2.0 | ~80 MB | Transformers.js local | `/assets/models/opus-mt-en-de/` |
| image-doc-repair | classic CV; OpenCV.js only lazily (~8 MB, not in the repo) | Apache-2.0 if present | — | own + optional OpenCV | `/assets/opencv/` (optional) |

Download only via `scripts/fetch-models.mjs` / `neotools models fetch`. Runtime: no HF/CDN.

## License research: faces / license plates

| Candidate | Finding | Decision |
|---|---|---|
| Ultralytics YOLOv8n-face / yolov8n | AGPL-3.0 weights | **forbidden** |
| `keremberke/yolov8n-license-plate` | AGPL (Ultralytics) | **forbidden** |
| OpenALPR | AGPL | **forbidden** |
| InsightFace SCRFD / RetinaFace | code often MIT, **pretrained weights non-commercial** | **forbidden** |
| RMBG-1.4 (briaai) | not free for commercial use | **forbidden** |
| `onnx-community/ISNet-ONNX` HF card | marked as AGPL-3.0 | **not used** |
| IS-Net official `xuebinqin/DIS` | Apache-2.0 | **ok** (q8 mirror SacredNoir / x-Liola-x) |
| U²-Net `xuebinqin/U-2-Net` / rembg `u2netp.onnx` | Apache-2.0 | **ok**, default |
| OpenCV YuNet | Apache-2.0 | **ok**, faces |
| MediaPipe BlazeFace | Apache-2.0 | slot possible; YuNet is smaller and clearly licensed |
| Xenova/yolos-tiny, DETR | Apache-2.0 | **ok**, persons |
| Real-ESRGAN | BSD-3-Clause | license ok, Swin2SR as the smaller Apache default |
| NAFNet | code MIT; no small, unambiguously free ONNX distribution found | **classic only** |

License plates: the optional model slot in the registry stays **empty** until an Apache/MIT/BSD ONNX model without an Ultralytics graph exists.

## Tool status

| ID | Status | Without model | Verify |
|---|---|---|---|
| image-remove-background | implemented | batch error per file, no crash | — |
| image-auto-blur | implemented | heuristic face + plate rectangles + OCR regex | variance + no EXIF |
| image-doc-repair | implemented | full classic pipeline | — |
| image-screenshot-workshop | implemented | leak only with OCR; wash/stitch/mockup/score always | redact modes |
| image-upscale | showcase | clear error message; optional bilinear flag | — |
| image-denoise | showcase, classic | always | — |
| image-alt-text | implemented (`pack: a11y`) | batch error + CSV hint; EXIF/XMP via the `tools-image` writer | — |

## Tests

Vitest without models: quad ±2 px, homography round trip, Sauvola, deskew, stitch, secret regex, blur verify, registry schema, tool runs (denoise/doc-repair/blur/detect, BG-remove error path). Model tests are `describe.skipIf` when the `.onnx` is missing.

## Limits

- Raster goes through `@neotools/tools-image` (`decode`/`encode`/`resample`).
- YuNet post-processing accepts `[n,15]`-like tensors; otherwise heuristic.
- The OCR text layer in PDF is invisible but simplified (no full `writeInvisibleWords` layout).
- EXIF `ImageDescription` / XMP is written by `writeImageDescription` (JPEG/PNG/WebP).
- Super-resolution / denoise are showcases, not a quality promise.
- OpenCV.js is not bundled (8 MB); lazy no-op when the file is missing.

## Codecs

`src/raster.ts` is a wrapper around `@neotools/tools-image` and keeps the signature `decode` / `encode` / `encodePng` / `decodePng` / `resizeBilinear`.
