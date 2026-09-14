import type { ToolLicense } from '@neotools/engine';
import {
  FFMPEG_CORE_LICENSE_GPL,
  FFMPEG_CORE_LICENSE_LGPL,
  getFfmpegCoreFlavor,
  getFfmpegCoreLicense,
} from './ffmpeg/core-flavor.js';

export {
  FFMPEG_CORE_LICENSE_GPL,
  FFMPEG_CORE_LICENSE_LGPL,
  getFfmpegCoreFlavor,
  getFfmpegCoreLicense,
  setFfmpegCoreFlavor,
} from './ffmpeg/core-flavor.js';

/** Current core SPDX label. Prefer `getFfmpegCoreLicense()` after the loader runs. */
export let FFMPEG_CORE_LICENSE: string = getFfmpegCoreLicense();

function buildMediaLicenses(): ToolLicense[] {
  const lgpl = getFfmpegCoreFlavor() === 'lgpl';
  const core: ToolLicense = lgpl
    ? {
        name: 'FFmpeg WASM-Core (eigener Build, kein x264/x265)',
        license: FFMPEG_CORE_LICENSE_LGPL,
        url: 'https://ffmpeg.org/legal.html',
      }
    : {
        name: '@ffmpeg/core (offizieller WASM-Build, enthält x264 — nur Übergang)',
        license: FFMPEG_CORE_LICENSE_GPL,
        url: 'https://www.npmjs.com/package/@ffmpeg/core',
      };
  return [
    { name: '@ffmpeg/ffmpeg (JS-Wrapper)', license: 'MIT', url: 'https://github.com/ffmpegwasm/ffmpeg.wasm' },
    { name: '@ffmpeg/util', license: 'MIT', url: 'https://github.com/ffmpegwasm/ffmpeg.wasm' },
    core,
    ...(lgpl
      ? []
      : [
          {
            name: '@ffmpeg/core-mt (offizieller Multithread-WASM-Build, enthält x264 — nur Übergang)',
            license: FFMPEG_CORE_LICENSE_GPL,
            url: 'https://www.npmjs.com/package/@ffmpeg/core-mt',
          },
        ]),
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
    { name: 'FreeType (LGPL-Build)', license: 'FTL', url: 'https://freetype.org/license.html' },
    { name: 'FriBidi (LGPL-Build)', license: 'LGPL-2.1-or-later', url: 'https://github.com/fribidi/fribidi' },
    { name: 'HarfBuzz (LGPL-Build)', license: 'MIT', url: 'https://github.com/harfbuzz/harfbuzz' },
    { name: 'zlib (LGPL-Build)', license: 'Zlib', url: 'https://zlib.net/zlib_license.html' },
    { name: 'mp4-muxer (H.264-Mux via WebCodecs)', license: 'MIT', url: 'https://github.com/Vanilagy/mp4-muxer' },
    { name: 'mp4box.js', license: 'BSD-3-Clause', url: 'https://github.com/gpac/mp4box.js' },
    { name: 'Source Sans 3 (Untertitel-Font)', license: 'OFL-1.1', url: 'https://github.com/adobe-fonts/source-sans' },
  ];
}

export const MEDIA_LICENSES: ToolLicense[] = buildMediaLicenses();

export function refreshMediaLicenses(): ToolLicense[] {
  FFMPEG_CORE_LICENSE = getFfmpegCoreLicense();
  const next = buildMediaLicenses();
  MEDIA_LICENSES.splice(0, MEDIA_LICENSES.length, ...next);
  return MEDIA_LICENSES;
}

/** @diffusion-studio/ffmpeg-lgpl-base: geprüft — LGPLv2.1-nahe, aber ohne libvpx/libopus/libass und altes 0.11-Core-Format, nicht mit @ffmpeg/ffmpeg 0.12 kompatibel. */
export const REJECTED_LGPL_NPM = '@diffusion-studio/ffmpeg-lgpl-base@0.0.1';
