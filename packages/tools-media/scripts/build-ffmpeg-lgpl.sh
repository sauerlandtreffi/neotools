#!/usr/bin/env bash
# LGPL FFmpeg WASM core — no --enable-gpl, no libx264/x265.
# Prefers Docker (Dockerfile.ffmpeg-lgpl). Local emcc path is a last resort and
# does not produce the @ffmpeg/ffmpeg 0.12 createFFmpegCore wrapper.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${FFMPEG_LGPL_OUT:-$ROOT/vendor/ffmpeg-lgpl}"
mkdir -p "$OUT"

if command -v docker >/dev/null 2>&1; then
  echo "Docker LGPL ffmpeg.wasm build → $OUT"
  docker build -f "$ROOT/Dockerfile.ffmpeg-lgpl" -t neotools-ffmpeg-lgpl "$ROOT"
  docker run --rm -v "$OUT:/out" neotools-ffmpeg-lgpl
  if [[ -f "$OUT/ffmpeg-core.js" && -f "$OUT/ffmpeg-core.wasm" ]]; then
    echo "LGPL core ready: $OUT/ffmpeg-core.js + ffmpeg-core.wasm"
    exit 0
  fi
  echo "Docker-Lauf erzeugte keine ffmpeg-core.* Dateien." >&2
  exit 1
fi

if ! command -v emcc >/dev/null 2>&1; then
  echo "Weder Docker noch Emscripten (emcc) verfügbar." >&2
  echo "  docker build -f $ROOT/Dockerfile.ffmpeg-lgpl -t neotools-ffmpeg-lgpl $ROOT" >&2
  echo "  docker run --rm -v $OUT:/out neotools-ffmpeg-lgpl" >&2
  exit 2
fi

echo "emcc ohne ffmpeg.wasm-Wrapper erzeugt kein createFFmpegCore — Docker nutzen." >&2
exit 2
