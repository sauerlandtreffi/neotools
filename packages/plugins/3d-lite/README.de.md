🇩🇪 Deutsch · [🇬🇧 English](./README.md)

# 3d-lite — Community-Plugin-Beispiel

Kein Kern-Pack. Wird **nicht** in Web/CLI/API registriert, bis ein Self-Host die WASM-Decoder unter `/assets/3d/` legt.

| Lib | SPDX | Laufzeit |
|---|---|---|
| three.js | MIT | optional, same-origin Bundle |
| Draco | Apache-2.0 | optional WASM |
| meshoptimizer | MIT | optional WASM |
| basis_universal | Apache-2.0 | optional WASM |

**Verboten:** CDN-URLs (`unpkg`, `jsdelivr`, `cdnjs`). Manifest-Loader darf nur `/plugins/3d-lite/` oder `node_modules/@neotools-plugin/3d-lite` lesen.

`gltf-inspect` ist ein Stub: liest Magic-Bytes (`glTF` / `glTF` binary) und schreibt einen JSON-Report. Kein Renderer im Kern.
