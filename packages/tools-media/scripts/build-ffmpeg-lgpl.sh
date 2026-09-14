#!/usr/bin/env bash
# LGPL FFmpeg WASM core — no --enable-gpl, no libx264/x265.
# Uses Dockerfile.ffmpeg-lgpl (derived from ffmpegwasm/ffmpeg.wasm v0.12.10).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${FFMPEG_LGPL_OUT:-$ROOT/vendor/ffmpeg-lgpl}"
LOG="${FFMPEG_LGPL_LOG:-/tmp/ffmpeg-lgpl-build.log}"
mkdir -p "$OUT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker erforderlich für den LGPL-Core-Build." >&2
  echo "  docker build -f $ROOT/Dockerfile.ffmpeg-lgpl --build-arg FFMPEG_ST=yes -t neotools-ffmpeg-lgpl $ROOT" >&2
  echo "  docker run --rm -v $OUT:/out neotools-ffmpeg-lgpl" >&2
  exit 2
fi

echo "Docker LGPL ffmpeg.wasm build → $OUT (log $LOG)"
{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) neotools-ffmpeg-lgpl ==="
  DOCKER_BUILDKIT=1 docker build \
    --progress=plain \
    -f "$ROOT/Dockerfile.ffmpeg-lgpl" \
    --build-arg FFMPEG_ST=yes \
    --build-arg EXTRA_CFLAGS="${EXTRA_CFLAGS:--O3 -msimd128}" \
    -t neotools-ffmpeg-lgpl \
    "$ROOT"
  docker run --rm -v "$OUT:/out" neotools-ffmpeg-lgpl
} 2>&1 | tee "$LOG"

if [[ -f "$OUT/ffmpeg-core.js" && -f "$OUT/ffmpeg-core.wasm" ]]; then
  echo "LGPL core ready: $OUT/ffmpeg-core.js + ffmpeg-core.wasm"
  ls -l "$OUT"
  exit 0
fi
echo "Docker-Lauf erzeugte keine ffmpeg-core.* Dateien. Siehe $LOG" >&2
exit 1
