#!/usr/bin/env bash
# LGPL FFmpeg WASM core for NeoTools — no --enable-gpl, no libx264/x265/rubberband/vidstab.
# Codecs: libvpx, libopus, libvorbis, libmp3lame (LGPL), optional libaom/libdav1d, native aac, pcm, flac, libass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${FFMPEG_LGPL_OUT:-$ROOT/dist-ffmpeg-lgpl}"
mkdir -p "$OUT"

if ! command -v emcc >/dev/null 2>&1; then
  echo "Emscripten (emcc) fehlt. Docker-Build:"
  echo "  docker build -f $ROOT/Dockerfile.ffmpeg-lgpl -t neotools-ffmpeg-lgpl $ROOT"
  echo "  docker run --rm -v $OUT:/out neotools-ffmpeg-lgpl"
  exit 2
fi

WORKDIR="${WORKDIR:-/tmp/neotools-ffmpeg-lgpl}"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

if [[ ! -d ffmpeg ]]; then
  git clone --depth 1 -b n6.1.1 https://git.ffmpeg.org/ffmpeg.git ffmpeg
fi

cd ffmpeg
emconfigure ./configure \
  --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib \
  --enable-cross-compile --target-os=none --arch=x86_32 \
  --disable-x86asm --disable-inline-asm --disable-stripping --disable-doc --disable-ffplay --disable-ffprobe \
  --disable-network --disable-autodetect \
  --enable-small --enable-lto \
  --enable-libvpx --enable-libopus --enable-libvorbis --enable-libmp3lame --enable-libass \
  --enable-encoder=libvpx_vp8,libvpx_vp9,libopus,libvorbis,libmp3lame,aac,flac,pcm_s16le,gif,png,mjpeg,mpeg4 \
  --enable-decoder=vp8,vp9,opus,vorbis,mp3,aac,flac,pcm_s16le,gif,h264,hevc,mpeg4,mjpeg \
  --enable-parser=aac,h264,hevc,opus,vorbis,vp8,vp9 \
  --enable-muxer=mp4,webm,matroska,gif,wav,ogg,ipod,mp3,null \
  --enable-demuxer=mov,matroska,gif,wav,ogg,mp3,image2 \
  --enable-filter=scale,crop,cropdetect,fps,palettegen,paletteuse,overlay,drawtext,subtitles,reverse,areverse,setpts,atempo,concat,split,tile,thumbnail,eq,hqdn3d,yadif,deshake,unsharp,tonemap,zscale,loudnorm,silenceremove,silencedetect,volume,alimiter,dcshift,aresample,aformat,afade,acrossfade,sidechaincompress,showspectrumpic,showwavespic,blackdetect,freezedetect,select,showinfo,astats,replaygain,pan,asetrate \
  --extra-cflags="$CFLAGS" \
  --extra-ldflags="$LDFLAGS"

# Absichtlich KEIN --enable-gpl und KEIN libx264/x265/librubberband/libvidstab.
emmake make -j"${JOBS:-$(nproc)}"
echo "Build fertig. Artefakte nach $OUT kopieren (ffmpeg-core.js / .wasm) und apps/web/public/assets/ffmpeg/ ersetzen."
echo "Lizenz des Produkts dann: LGPL-2.1-or-later (FFmpeg + LAME + libass ISC)."
