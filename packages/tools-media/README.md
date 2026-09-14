# `@neotools/tools-media`

FFmpeg-Pack (`pack: 'media'`) — Video- und Audio-Kern plus deklarative Presets.

## FFmpeg-Lizenz

| Komponente | SPDX | Status |
|---|---|---|
| `@ffmpeg/ffmpeg` JS-Wrapper | MIT | genutzt |
| `@ffmpeg/core` 0.12.x (npm) | **GPL-2.0-or-later** (x264/x265) | **temporär**, klar gekennzeichnet |
| `@diffusion-studio/ffmpeg-lgpl-base` | FFmpeg LGPL, npm MIT | geprüft: altes 0.11-Format, **keine** libvpx/libopus/libass — nicht als 0.12-Core nutzbar |
| Ziel-Build `scripts/build-ffmpeg-lgpl.sh` | **LGPL-2.1-or-later** | kein `--enable-gpl`, Codecs: libvpx, libopus, libvorbis, libmp3lame, libass, native AAC/PCM/FLAC |

H.264-**Encode** im Browser: WebCodecs `VideoEncoder` `avc1.*` + `mp4-muxer` (MIT). Decode: WebCodecs + `mp4box.js` (BSD-3) wo möglich, sonst FFmpeg.

## Node

Bevorzugt System-`ffmpeg` (`PATH`, Capability `ffmpegNative`). Tests nutzen das. WASM-Fallback über `@ffmpeg/ffmpeg` 0.12.

## API für Pack `speech`

```ts
import { extractAudio, probe } from '@neotools/tools-media';

const wav = await extractAudio(file, { sampleRate: 16000, mono: true, format: 'wav' }, ctx);
const info = await probe(file, ctx);
```

## `audio-stems`

Offen: kein MIT/Apache-ONNX in vertretbarer Größe gebündelt.
