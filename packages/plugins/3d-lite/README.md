🇬🇧 English · [🇩🇪 Deutsch](./README.de.md)

# 3d-lite — community plugin example

Not a core pack. It is **not** registered in Web/CLI/API until a self-host places the WASM decoders under `/assets/3d/`.

| Lib | SPDX | Runtime |
|---|---|---|
| three.js | MIT | optional, same-origin bundle |
| Draco | Apache-2.0 | optional WASM |
| meshoptimizer | MIT | optional WASM |
| basis_universal | Apache-2.0 | optional WASM |

**Forbidden:** CDN URLs (`unpkg`, `jsdelivr`, `cdnjs`). The manifest loader may only read `/plugins/3d-lite/` or `node_modules/@neotools-plugin/3d-lite`.

`gltf-inspect` is a stub: it reads magic bytes (`glTF` / `glTF` binary) and writes a JSON report. No renderer in the core.
