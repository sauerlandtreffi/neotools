🇬🇧 English · [🇩🇪 Deutsch](./README.de.md)

# `@neotools/tools-media`

FFmpeg pack (`pack: 'media'`) — video and audio core plus declarative presets.

## FFmpeg license

The browser and Node WASM path loads our own LGPL core **by default**
(`vendor/ffmpeg-lgpl/`, copied to `/assets/ffmpeg/` and `/assets/ffmpeg/lgpl/`).
Only if this core is missing does the loader fall back to the npm package `@ffmpeg/core`.

| Component | SPDX | Status |
|---|---|---|
| `@ffmpeg/ffmpeg` JS wrapper | MIT | used |
| Own core (`Dockerfile.ffmpeg-lgpl`) | **LGPL-2.1-or-later (own build)** | target; no `--enable-gpl` |
| `@ffmpeg/core` 0.12.x (npm) | **GPL-2.0-or-later (temporary)** | fallback, clearly labeled |
| `@diffusion-studio/ffmpeg-lgpl-base` | FFmpeg LGPL, npm MIT | checked: old 0.11 format, **no** libvpx/libopus/libass — not usable as a 0.12 core |

`getFfmpegCoreLicense()` / `MEDIA_LICENSES` switch dynamically:

- LGPL core present: `LGPL-2.1-or-later (eigener Build)`
- otherwise: `GPL-2.0-or-later (temporär)`

### Why LGPL?

The official `@ffmpeg/core` from ffmpeg.wasm is **GPL** because it links x264/x265 (and further GPL parts). NeoTools wants to bundle the core in the browser without putting the whole app under the GPL. Hence an **own** build of FFmpeg n5.1.4 + ffmpeg.wasm v0.12.10 glue **without** `--enable-gpl`.

`--enable-version3` is not set (LGPL-2.1, not v3).

### What the LGPL core can do

libvpx (VP8/VP9), libopus, libvorbis, libmp3lame, libass (+ FreeType, FriBidi, HarfBuzz), native AAC, FLAC, PCM, zlib; filters including `subtitles`, `loudnorm`, `scale`, `crop`, `palettegen`/`paletteuse`, `showspectrumpic`/`showwavespic`, `sidechaincompress`, `atempo`, `asetrate`, `tonemap`, `blackdetect`/`freezedetect`/`scdet`, `tile`, `thumbnail`, `concat`, `deshake` (LGPL alternative to vidstab), `yadif`, `unsharp`.

### What is missing (deliberately)

| Missing | Replacement |
|---|---|
| **H.264 encode** (no libx264) | WebCodecs `VideoEncoder` `avc1.*` + `mp4-muxer` (MIT) |
| HEVC encode (no libx265) | not in the browser core |
| libfdk-aac | native FFmpeg AAC |
| rubberband | `asetrate` + `atempo` |
| vidstab | `deshake` |
| GPL filters `hqdn3d`, `cropdetect`, `eq` | only with system FFmpeg (typically GPL) or manual crop / another denoise |

### Building / fetching the core

```bash
# Docker, ~30–60 min, writes vendor/ffmpeg-lgpl/ (gitignored, > 2 MB)
bash packages/tools-media/scripts/build-ffmpeg-lgpl.sh

# or the artifact of the GH Action .github/workflows/ffmpeg-lgpl.yml
node scripts/fetch-ffmpeg-lgpl.mjs
```

The Dockerfile is derived from [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) **v0.12.10** (their scripts set `EM_TOOLCHAIN_FILE` to `$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`). Sidecars: `BUILD-INFO.json` (configure flags, versions, SHA-256), `LICENSE.txt`.

No CDN. `scripts/copy-wasm-assets.mjs` replaces `/assets/ffmpeg/ffmpeg-core.*` with the LGPL core when present.

H.264 **decode** where possible: WebCodecs + `mp4box.js` (BSD-3), otherwise FFmpeg.

## Node

Prefers the system `ffmpeg` (`PATH`, capability `ffmpegNative`).  
`NEOTOOLS_FFMPEG_NATIVE=0` forces the WASM path (tests without system FFmpeg). Tests then use `vendor/ffmpeg-lgpl` in-process (`createFFmpegCore` + `wasmBinary`).

## API for the `speech` pack

```ts
import { extractAudio, probe } from '@neotools/tools-media';

const wav = await extractAudio(file, { sampleRate: 16000, mono: true, format: 'wav' }, ctx);
const info = await probe(file, ctx);
```

## `audio-stems`

Open: no MIT/Apache ONNX model of reasonable size bundled.
