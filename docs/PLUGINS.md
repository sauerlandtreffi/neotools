🇬🇧 English · [🇩🇪 Deutsch](./PLUGINS.de.md)

# Community plugins

State: wave 5. This document describes the plugin concept using the example pack
`packages/plugins/3d-lite/` and the **honest implementation status**: the manifest format and the
sandbox rules are defined, but a manifest loader in `packages/engine` does **not exist yet**
(phase 5, `docs/ROADMAP.md` → "Community manifest loader, sandbox"). The example is therefore not registered in
web, CLI or API.

Related: [ARCHITECTURE.md §5](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md) ·
[CONTRIBUTING.md](../CONTRIBUTING.md)

## Core pack vs. community plugin

| Property          | Core pack (`packages/tools-*`)                     | Community plugin (`packages/plugins/*`, `@neotools-plugin/*`)                        |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Registration      | static in `apps/*` (`registerXxxTools`)            | via manifest loader (open), never automatic                                          |
| Platform access   | full `ToolContext.platform`                        | only declared caps (`sandbox.platform`)                                              |
| Network           | same-origin `/assets`, user URLs                   | `sandbox.network: "none"` — no `fetch` to third-party hosts                          |
| Assets            | `apps/web/public/assets/<pack>/`                   | `/plugins/<id>/` (self-host) or `node_modules/@neotools-plugin/<id>/`                |
| Licenses          | `src/licenses.ts` → `/lizenzen`                    | `manifest.json.licenses` + `package.json.neotoolsPlugin.licenses` → `/lizenzen`      |
| Workspace         | in `pnpm-workspace.yaml` (`packages/*`)            | **not** in the workspace (`packages/plugins/*` is nested), separate install          |
| Visibility        | tool grid, SEO pages                               | only after activation by the self-host                                               |

## Layout of the `3d-lite` example

```
packages/plugins/3d-lite/
├── manifest.json      plugin manifest (format from ARCHITECTURE.md §5.1, extended with sandbox)
├── package.json       npm metadata + neotoolsPlugin block
├── README.md          license table, forbidden list (CDNs), stub description
└── src/index.ts       inspectGltfMagic() — reads magic bytes, no renderer, no network
```

The plugin is deliberately a stub: `gltf-inspect` detects `glTF` binary (`glb`) or JSON glTF from the header
and returns a JSON report. three.js, Draco, meshoptimizer and basis_universal are **not**
bundled; a self-host would have to place them under `/assets/3d/`.

## `manifest.json`

```json
{
  "id": "3d-lite",
  "version": "0.1.0",
  "title": { "de": "3D lite (Community)", "en": "3D lite (community)" },
  "tools": ["gltf-inspect"],
  "lazy": true,
  "optional": true,
  "assets": [],
  "licenses": [
    { "spdx": "MIT", "component": "three.js", "url": "https://github.com/mrdoob/three.js", "note": "…" }
  ],
  "sandbox": { "platform": ["readBytes"], "network": "none" }
}
```

| Field               | Type                    | Meaning                                                                                                                    |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `string`                | Unique plugin ID (kebab-case). Becomes the asset namespace (`/plugins/<id>/`) and must match `neotoolsPlugin.id`.          |
| `version`           | semver                  | Plugin version; independent of the NeoTools version.                                                                       |
| `title`             | `{ de, en }`            | Display name, **both languages required** (i18n rule).                                                                     |
| `tools`             | `string[]`              | Tool IDs the plugin provides via `defineTool`. IDs must not override core IDs.                                             |
| `lazy`              | `boolean`               | `true`: load code only when the tool page is opened (mandatory for plugins with WASM).                                     |
| `optional`          | `boolean`               | `true`: the Docker build may omit the plugin (`NEOTOOLS_PACKS`).                                                           |
| `assets`            | `string[]`              | Relative paths to WASM/models under `/plugins/<id>/`. Absolute URLs or third-party hosts are invalid.                      |
| `licenses[]`        | `PackLicense[]`         | `spdx`, `component`, `url`, optional `note`. Every bundled **or** dynamically loaded library. Required.                    |
| `sandbox.platform`  | `string[]`              | Allowed platform capabilities (caps). Everything outside this list is `undefined` at runtime.                              |
| `sandbox.network`   | `"none"`                | Currently the only permitted value. Plugins get no `fetch` to foreign hosts.                                               |

## `package.json` → `neotoolsPlugin`

```json
{
  "name": "@neotools-plugin/3d-lite",
  "license": "MIT",
  "type": "module",
  "main": "./src/index.ts",
  "neotoolsPlugin": {
    "id": "3d-lite",
    "caps": ["read-bytes"],
    "licenses": [{ "name": "three.js", "license": "MIT" }]
  }
}
```

- `name` must start with `@neotools-plugin/` — only this scope is read from `node_modules` by the (future)
  loader.
- `neotoolsPlugin.id` = `manifest.json.id`.
- `neotoolsPlugin.caps` is the npm-side short form of `sandbox.platform` (`read-bytes` ↔ `readBytes`),
  so that registry scripts can work without the manifest.
- `neotoolsPlugin.licenses` (`name`, `license`) mirrors `manifest.json.licenses` for `npm ls`-based
  checks. In case of discrepancies the manifest wins.

## Caps sandbox

Core tools get the full `ToolContext` (`progress`, `signal`, `log`, `platform` with
`capabilities`, `encodeRaster`, `assets`). Plugins should only receive what they declare:

| Cap (`sandbox.platform`) | Access                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| `readBytes`              | `NeoFile.bytes()` of the provided inputs                            |
| `canvas`                 | `platform.encodeRaster()` / OffscreenCanvas                         |
| `opfs`                   | OPFS streaming for large files                                      |
| `assets`                 | `platform.assets.*` (same-origin `/plugins/<id>/` only)             |
| `workers`                | own sub-workers                                                     |

Undeclared caps are hidden by the loader (proxy on `platform`); `network` is always `none`.
A plugin must not set `privacySensitive` — privacy operations stay in the core (verify hook).

## License obligations

- Every library, model and font in the plugin is listed in `manifest.json.licenses` with an
  SPDX identifier and URL.
- Permitted: MIT, Apache-2.0, BSD, ISC, MPL-2.0, OFL, Zlib; LGPL only dynamically loaded (not bundled) and
  with a `note`. **Forbidden:** AGPL, proprietary licenses without redistribution rights, CDN runtime dependencies
  (`unpkg`, `jsdelivr`, `cdnjs`, Hugging Face Hub default).
- For the example, the entries are additionally listed in `packages/engine/src/licenses.ts` (`PLATFORM_LICENSES`)
  as "community plugin 3d-lite, not bundled", so that `/lizenzen`,
  `/licenses.json` and `/THIRD_PARTY_NOTICES.txt` already mention them today. With a loader they would come from
  the manifest.

## Registration — current state

There is **no** manifest loader. `packages/engine/src/` only knows `Registry.register(tool)` and the
`registerPack` patterns of the core packs; `apps/web/src/lib/registry.ts` chains the ten core packs
statically. If you still want to try the example locally:

1. Add `packages/plugins/3d-lite` to `pnpm-workspace.yaml` (or link it as a local package).
2. Build a `defineTool` object `gltf-inspect` around `inspectGltfMagic` (title de/en, Zod options,
   `licenses` from the manifest).
3. Register it like a core pack in `apps/web/src/lib/registry.ts`, `apps/cli/src/cli.ts` and
   `apps/api/src/optional-packs.ts`.
4. Place assets under `apps/web/public/plugins/3d-lite/` — no CDN.

This is a manual core-pack path, not a plugin activation.

## Planned (phase 5, open)

- `loadPluginManifest(source)`: reads `/plugins/<id>/manifest.json` (self-host) or
  `node_modules/@neotools-plugin/*/manifest.json`, validates via Zod, rejects core ID collisions,
  `assets` with a host part and `network !== "none"`.
- Sandbox proxy on `ToolContext.platform` according to `sandbox.platform`.
- Automatic inclusion of manifest licenses in `collectLicenses()`.
- Feature flag `community-exotic` (default off) and a "Community plugin" banner on the tool page.
- Docker: extend `NEOTOOLS_PACKS` so plugins can be omitted like optional packs.
