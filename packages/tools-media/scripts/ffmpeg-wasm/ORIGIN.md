# ffmpeg.wasm v0.12.10 snapshot

Build scripts (`build/*.sh`), `src/bind/`, and `src/fftools/` are copied from
[`ffmpegwasm/ffmpeg.wasm`](https://github.com/ffmpegwasm/ffmpeg.wasm) tag **v0.12.10**
(MIT wrapper; fftools are FFmpeg LGPL). They set `EM_TOOLCHAIN_FILE` to
`$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`.

Patches vs upstream:

- `build/ffmpeg-wasm.sh`: no `-lpostproc` (GPL-only), ST `INITIAL_MEMORY=64MB`, `-sSTACK_SIZE=5MB` (the VP9 encoder overflows the 64 KB default stack of emsdk ≥ 3.1.27 — which is why the official @ffmpeg/core 0.12.10 traps on `libvpx-vp9` with "memory access out of bounds")
- `build/zlib.sh`: fail clearly if the Emscripten CMake toolchain file is missing
- Dockerfile omits `--enable-gpl`, libx264, libx265, libvidstab, librubberband, libfdk
