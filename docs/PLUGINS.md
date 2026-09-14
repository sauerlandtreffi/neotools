# Community-Plugins

Stand: Welle 5. Dieses Dokument beschreibt das Plugin-Konzept anhand des Beispiel-Packs
`packages/plugins/3d-lite/` und den **ehrlichen Umsetzungsstand**: Das Manifest-Format und die
Sandbox-Regeln sind definiert, ein Manifest-Loader in `packages/engine` existiert **noch nicht**
(Phase 5, `docs/ROADMAP.md` → „Community-Manifest-Loader, Sandbox“). Das Beispiel wird daher weder in Web,
CLI noch API registriert.

Verwandt: [ARCHITECTURE.md §5](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md) ·
[CONTRIBUTING.md](../CONTRIBUTING.md)

## Kern-Pack vs. Community-Plugin

| Eigenschaft            | Kern-Pack (`packages/tools-*`)                    | Community-Plugin (`packages/plugins/*`, `@neotools-plugin/*`)                    |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Registrierung          | statisch in `apps/*` (`registerXxxTools`)         | über Manifest-Loader (offen), nie automatisch                                    |
| Plattformzugriff       | voller `ToolContext.platform`                     | nur deklarierte Caps (`sandbox.platform`)                                        |
| Netzwerk               | same-origin `/assets`, Nutzer-URLs                | `sandbox.network: "none"` — kein `fetch` auf Dritt-Hosts                         |
| Assets                 | `apps/web/public/assets/<pack>/`                  | `/plugins/<id>/` (Self-Host) oder `node_modules/@neotools-plugin/<id>/`          |
| Lizenzen               | `src/licenses.ts` → `/lizenzen`                   | `manifest.json.licenses` + `package.json.neotoolsPlugin.licenses` → `/lizenzen`  |
| Workspace              | in `pnpm-workspace.yaml` (`packages/*`)           | **nicht** im Workspace (`packages/plugins/*` ist verschachtelt), eigenes Install |
| Sichtbarkeit           | Tool-Grid, SEO-Seiten                             | erst nach Aktivierung durch den Self-Host                                        |

## Aufbau des Beispiels `3d-lite`

```
packages/plugins/3d-lite/
├── manifest.json      Plugin-Manifest (Format aus ARCHITECTURE.md §5.1, erweitert um sandbox)
├── package.json       npm-Metadaten + neotoolsPlugin-Block
├── README.md          Lizenztabelle, Verbotsliste (CDNs), Stub-Beschreibung
└── src/index.ts       inspectGltfMagic() — liest Magic-Bytes, kein Renderer, kein Netzwerk
```

Das Plugin ist bewusst ein Stub: `gltf-inspect` erkennt `glTF`-Binary (`glb`) bzw. JSON-glTF am Header
und liefert einen JSON-Report. three.js, Draco, meshoptimizer und basis_universal werden **nicht**
gebündelt; ein Self-Host müsste sie unter `/assets/3d/` ablegen.

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

| Feld                | Typ                     | Bedeutung                                                                                                                   |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `string`                | Eindeutige Plugin-ID (kebab-case). Wird zum Namespace der Assets (`/plugins/<id>/`) und muss zu `neotoolsPlugin.id` passen. |
| `version`           | semver                  | Plugin-Version; unabhängig von der NeoTools-Version.                                                                        |
| `title`             | `{ de, en }`            | Anzeigename, **beide Sprachen Pflicht** (i18n-Regel).                                                                       |
| `tools`             | `string[]`              | Tool-IDs, die das Plugin per `defineTool` bereitstellt. IDs dürfen keine Kern-IDs überschreiben.                            |
| `lazy`              | `boolean`               | `true`: Code erst beim Öffnen der Tool-Seite laden (Pflicht für Plugins mit WASM).                                          |
| `optional`          | `boolean`               | `true`: Docker-Build darf das Plugin weglassen (`NEOTOOLS_PACKS`).                                                          |
| `assets`            | `string[]`              | Relative Pfade zu WASM/Modellen unter `/plugins/<id>/`. Absolute URLs oder Dritt-Hosts sind ungültig.                       |
| `licenses[]`        | `PackLicense[]`         | `spdx`, `component`, `url`, optional `note`. Jede gebündelte **oder** dynamisch geladene Lib. Pflichtfeld.                  |
| `sandbox.platform`  | `string[]`              | Erlaubte Plattform-Fähigkeiten (Caps). Alles außerhalb dieser Liste ist zur Laufzeit `undefined`.                           |
| `sandbox.network`   | `"none"`                | Aktuell einziger zulässiger Wert. Plugins erhalten kein `fetch` auf fremde Hosts.                                            |

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

- `name` muss mit `@neotools-plugin/` beginnen — nur dieser Scope wird vom (künftigen) Loader aus
  `node_modules` gelesen.
- `neotoolsPlugin.id` = `manifest.json.id`.
- `neotoolsPlugin.caps` ist die npm-seitige Kurzform von `sandbox.platform` (`read-bytes` ↔ `readBytes`),
  damit Registry-Skripte ohne das Manifest arbeiten können.
- `neotoolsPlugin.licenses` (`name`, `license`) spiegelt `manifest.json.licenses` für `npm ls`-basierte
  Prüfungen. Bei Abweichungen gewinnt das Manifest.

## Caps-Sandbox

Kern-Tools bekommen den vollständigen `ToolContext` (`progress`, `signal`, `log`, `platform` mit
`capabilities`, `encodeRaster`, `assets`). Plugins sollen nur erhalten, was sie deklarieren:

| Cap (`sandbox.platform`) | Zugriff                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `readBytes`              | `NeoFile.bytes()` der übergebenen Eingaben                          |
| `canvas`                 | `platform.encodeRaster()` / OffscreenCanvas                         |
| `opfs`                   | OPFS-Streaming für große Dateien                                    |
| `assets`                 | `platform.assets.*` (nur same-origin `/plugins/<id>/`)              |
| `workers`                | eigene Sub-Worker                                                   |

Nicht deklarierte Caps werden im Loader ausgeblendet (Proxy auf `platform`), `network` ist immer `none`.
Ein Plugin darf `privacySensitive` nicht setzen — Privacy-Operationen bleiben im Kern (Verify-Hook).

## Lizenzpflicht

- Jede Bibliothek, jedes Modell und jede Schrift im Plugin steht in `manifest.json.licenses` mit
  SPDX-Kennung und URL.
- Zulässig: MIT, Apache-2.0, BSD, ISC, MPL-2.0, OFL, Zlib; LGPL nur dynamisch geladen (nicht gebündelt) und
  mit `note`. **Verboten:** AGPL, proprietäre Lizenzen ohne Redistribution, CDN-Laufzeitabhängigkeiten
  (`unpkg`, `jsdelivr`, `cdnjs`, Hugging-Face-Hub-Default).
- Für das Beispiel sind die Einträge zusätzlich in `packages/engine/src/licenses.ts` (`PLATFORM_LICENSES`)
  als „Community-Plugin 3d-lite, nicht gebündelt“ aufgeführt, damit `/lizenzen`,
  `/licenses.json` und `/THIRD_PARTY_NOTICES.txt` sie heute schon nennen. Mit einem Loader würden sie aus
  dem Manifest kommen.

## Registrierung — Stand heute

Es gibt **keinen** Manifest-Loader. `packages/engine/src/` kennt nur `Registry.register(tool)` und
`registerPack`-Muster der Kern-Packs; `apps/web/src/lib/registry.ts` verkettet die zehn Kern-Packs
statisch. Wer das Beispiel dennoch lokal ausprobieren will:

1. `packages/plugins/3d-lite` in `pnpm-workspace.yaml` aufnehmen (oder als lokales Paket verlinken).
2. Ein `defineTool`-Objekt `gltf-inspect` um `inspectGltfMagic` bauen (Titel de/en, Zod-Optionen,
   `licenses` aus dem Manifest).
3. In `apps/web/src/lib/registry.ts`, `apps/cli/src/cli.ts` und `apps/api/src/optional-packs.ts` wie ein
   Kern-Pack registrieren.
4. Assets unter `apps/web/public/plugins/3d-lite/` ablegen — ohne CDN.

Das ist ein manueller Kern-Pack-Pfad, keine Plugin-Aktivierung.

## Geplant (Phase 5, offen)

- `loadPluginManifest(source)`: liest `/plugins/<id>/manifest.json` (Self-Host) oder
  `node_modules/@neotools-plugin/*/manifest.json`, validiert per Zod, lehnt Kern-ID-Kollisionen,
  `assets` mit Host-Anteil und `network !== "none"` ab.
- Sandbox-Proxy auf `ToolContext.platform` gemäß `sandbox.platform`.
- Automatische Aufnahme der Manifest-Lizenzen in `collectLicenses()`.
- Feature-Flag `community-exotic` (Default aus) und Banner „Community-Plugin“ auf der Tool-Seite.
- Docker: `NEOTOOLS_PACKS` erweitern, damit Plugins wie optionale Packs weggelassen werden können.
