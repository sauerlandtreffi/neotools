#!/bin/bash
# `-o <OUTPUT_FILE_NAME>` must be provided when using this build script.
# Derived from ffmpeg.wasm v0.12.10 (MIT). LGPL link line: no libpostproc (GPL).
# ex:
#     bash ffmpeg-wasm.sh -o ffmpeg.js

set -euo pipefail

EXPORT_NAME="createFFmpegCore"

CONF_FLAGS=(
  -I.
  -I./src/fftools
  -I$INSTALL_DIR/include
  -L$INSTALL_DIR/lib
  -Llibavcodec
  -Llibavdevice
  -Llibavfilter
  -Llibavformat
  -Llibavutil
  -Llibswresample
  -Llibswscale
  -lavcodec
  -lavdevice
  -lavfilter
  -lavformat
  -lavutil
  -lswresample
  -lswscale
  -Wno-deprecated-declarations
  $LDFLAGS
  -sWASM_BIGINT
  -sUSE_SDL=2
  -sMODULARIZE
  ${FFMPEG_MT:+ -sUSE_PTHREADS -pthread -sINITIAL_MEMORY=1024MB}
  ${FFMPEG_MT:+ -sPTHREAD_POOL_SIZE=32}
  ${FFMPEG_ST:+ -sINITIAL_MEMORY=64MB -sALLOW_MEMORY_GROWTH}
  -sSTACK_SIZE=5MB # emsdk >= 3.1.27 defaults to 64KB; libvpx-vp9 encoder overflows that (OOB trap)
  -sEXPORT_NAME="$EXPORT_NAME"
  -sEXPORTED_FUNCTIONS=$(node src/bind/ffmpeg/export.js)
  -sEXPORTED_RUNTIME_METHODS=$(node src/bind/ffmpeg/export-runtime.js)
  -lworkerfs.js
  --pre-js src/bind/ffmpeg/bind.js
  src/fftools/cmdutils.c
  src/fftools/ffmpeg.c
  src/fftools/ffmpeg_filter.c
  src/fftools/ffmpeg_hw.c
  src/fftools/ffmpeg_mux.c
  src/fftools/ffmpeg_opt.c
  src/fftools/opt_common.c
)

emcc "${CONF_FLAGS[@]}" $@
