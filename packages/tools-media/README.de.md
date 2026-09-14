🇩🇪 Deutsch · [🇬🇧 English](./README.md)

# `@neotools/tools-media`

FFmpeg-Pack (`pack: 'media'`) — Video- und Audio-Kern plus deklarative Presets.

## FFmpeg-Lizenz

Der Browser- und Node-WASM-Pfad lädt **standardmäßig** den eigenen LGPL-Core
(`vendor/ffmpeg-lgpl/`, kopiert nach `/assets/ffmpeg/` und `/assets/ffmpeg/lgpl/`).
Nur wenn dieser Core fehlt, fällt der Loader auf das npm-Paket `@ffmpeg/core` zurück.

| Komponente | SPDX | Status |
|---|---|---|
| `@ffmpeg/ffmpeg` JS-Wrapper | MIT | genutzt |
| Eigener Core (`Dockerfile.ffmpeg-lgpl`) | **LGPL-2.1-or-later (eigener Build)** | Ziel; kein `--enable-gpl` |
| `@ffmpeg/core` 0.12.x (npm) | **GPL-2.0-or-later (temporär)** | Fallback, klar gekennzeichnet |
| `@diffusion-studio/ffmpeg-lgpl-base` | FFmpeg LGPL, npm MIT | geprüft: altes 0.11-Format, **keine** libvpx/libopus/libass — nicht als 0.12-Core nutzbar |

`getFfmpegCoreLicense()` / `MEDIA_LICENSES` schalten dynamisch:

- LGPL-Core vorhanden: `LGPL-2.1-or-later (eigener Build)`
- sonst: `GPL-2.0-or-later (temporär)`

### Warum LGPL?

Der offizielle `@ffmpeg/core` von ffmpeg.wasm ist **GPL**, weil er x264/x265 (und weitere GPL-Teile) einlinkt. NeoTools will den Core im Browser bündeln, ohne die gesamte App unter GPL zu stellen. Deshalb ein **eigener** Build von FFmpeg n5.1.4 + ffmpeg.wasm-v0.12.10-Glue **ohne** `--enable-gpl`.

`--enable-version3` wird nicht gesetzt (LGPL-2.1, nicht v3).

### Was der LGPL-Core kann

libvpx (VP8/VP9), libopus, libvorbis, libmp3lame, libass (+ FreeType, FriBidi, HarfBuzz), natives AAC, FLAC, PCM, zlib; Filter u. a. `subtitles`, `loudnorm`, `scale`, `crop`, `palettegen`/`paletteuse`, `showspectrumpic`/`showwavespic`, `sidechaincompress`, `atempo`, `asetrate`, `tonemap`, `blackdetect`/`freezedetect`/`scdet`, `tile`, `thumbnail`, `concat`, `deshake` (LGPL-Alternative zu vidstab), `yadif`, `unsharp`.

### Was fehlt (bewusst)

| Fehlt | Ersatz |
|---|---|
| **H.264-Encode** (kein libx264) | WebCodecs `VideoEncoder` `avc1.*` + `mp4-muxer` (MIT) |
| HEVC-Encode (kein libx265) | nicht im Browser-Core |
| libfdk-aac | natives FFmpeg-AAC |
| rubberband | `asetrate` + `atempo` |
| vidstab | `deshake` |
| GPL-Filter `hqdn3d`, `cropdetect`, `eq` | nur mit System-FFmpeg (typisch GPL) oder manuellem Crop / anderem Denoise |

### Core bauen / holen

```bash
# Docker, ~30–60 min, schreibt vendor/ffmpeg-lgpl/ (gitignored, > 2 MB)
bash packages/tools-media/scripts/build-ffmpeg-lgpl.sh

# oder Artefakt der GH-Action .github/workflows/ffmpeg-lgpl.yml
node scripts/fetch-ffmpeg-lgpl.mjs
```

Das Dockerfile ist von [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) **v0.12.10** abgeleitet (deren Skripte setzen `EM_TOOLCHAIN_FILE` auf `$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`). Sidecars: `BUILD-INFO.json` (Configure-Flags, Versionen, SHA-256), `LICENSE.txt`.

Kein CDN. `scripts/copy-wasm-assets.mjs` ersetzt `/assets/ffmpeg/ffmpeg-core.*` durch den LGPL-Core, wenn vorhanden.

H.264-**Decode** wo möglich: WebCodecs + `mp4box.js` (BSD-3), sonst FFmpeg.

## Node

Bevorzugt System-`ffmpeg` (`PATH`, Capability `ffmpegNative`).  
`NEOTOOLS_FFMPEG_NATIVE=0` erzwingt den WASM-Pfad (Tests ohne System-FFmpeg). Tests nutzen dann `vendor/ffmpeg-lgpl` in-process (`createFFmpegCore` + `wasmBinary`).

## API für Pack `speech`

```ts
import { extractAudio, probe } from '@neotools/tools-media';

const wav = await extractAudio(file, { sampleRate: 16000, mono: true, format: 'wav' }, ctx);
const info = await probe(file, ctx);
```

## `audio-stems`

Offen: kein MIT/Apache-ONNX in vertretbarer Größe gebündelt.
