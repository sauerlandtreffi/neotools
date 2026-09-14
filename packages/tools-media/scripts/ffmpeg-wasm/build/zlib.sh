#!/bin/bash
# ffmpeg.wasm v0.12.10 zlib.sh — CMake via Emscripten toolchain (absolute fallback).

set -euo pipefail

TOOLCHAIN="${EM_TOOLCHAIN_FILE:-/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake}"
if [[ ! -f "$TOOLCHAIN" ]]; then
  echo "EM_TOOLCHAIN_FILE missing: $TOOLCHAIN (EMSDK=${EMSDK:-unset})" >&2
  ls -la /emsdk/upstream/emscripten/cmake/Modules/Platform/ 2>/dev/null || true
  exit 1
fi

CM_FLAGS=(
  -DCMAKE_INSTALL_PREFIX=$INSTALL_DIR
  -DCMAKE_TOOLCHAIN_FILE=$TOOLCHAIN
  -DBUILD_SHARED_LIBS=OFF
  -DSKIP_INSTALL_FILES=ON
)

mkdir -p build
cd build
emmake cmake .. -DCMAKE_C_FLAGS="$CXXFLAGS" "${CM_FLAGS[@]}"
emmake make clean
emmake make install
