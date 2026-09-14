import type { ToolLicense } from '@neotools/engine';

export const FFMPEG_CORE_LICENSE =
  'GPL-2.0-or-later (temporär, ersetzen durch LGPL-Build)' as const;

export const MEDIA_LICENSES: ToolLicense[] = [
  { name: '@ffmpeg/ffmpeg (JS-Wrapper)', license: 'MIT', url: 'https://github.com/ffmpegwasm/ffmpeg.wasm' },
  {
    name: '@ffmpeg/core (offizieller WASM-Build, enthält x264 — nur Übergang)',
    license: FFMPEG_CORE_LICENSE,
    url: 'https://www.npmjs.com/package/@ffmpeg/core',
  },
  {
    name: 'FFmpeg Ziel-Build (scripts/build-ffmpeg-lgpl.sh, kein --enable-gpl, kein x264/x265)',
    license: 'LGPL-2.1-or-later',
    url: 'https://ffmpeg.org/legal.html',
  },
  { name: 'libvpx (VP8/VP9, LGPL-Build)', license: 'BSD-3-Clause', url: 'https://github.com/webmproject/libvpx' },
  { name: 'libopus', license: 'BSD-3-Clause', url: 'https://opus-codec.org/' },
  { name: 'libvorbis', license: 'BSD-3-Clause', url: 'https://xiph.org/vorbis/' },
  { name: 'LAME libmp3lame', license: 'LGPL-2.0-or-later', url: 'https://lame.sourceforge.io/' },
  { name: 'libass (Untertitel, LGPL-Build)', license: 'ISC', url: 'https://github.com/libass/libass' },
  { name: 'mp4-muxer (H.264-Mux via WebCodecs)', license: 'MIT', url: 'https://github.com/Vanilagy/mp4-muxer' },
  { name: 'mp4box.js', license: 'BSD-3-Clause', url: 'https://github.com/gpac/mp4box.js' },
  { name: 'Source Sans 3 (Untertitel-Font)', license: 'OFL-1.1', url: 'https://github.com/adobe-fonts/source-sans' },
];

/** @diffusion-studio/ffmpeg-lgpl-base: geprüft — LGPLv2.1-nahe, aber ohne libvpx/libopus/libass und altes 0.11-Core-Format, nicht mit @ffmpeg/ffmpeg 0.12 kompatibel. */
export const REJECTED_LGPL_NPM = '@diffusion-studio/ffmpeg-lgpl-base@0.0.1';
