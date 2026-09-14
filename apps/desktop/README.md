# NeoTools Desktop (Tauri 2)

Native shell around the static `apps/web` build. Double-click a `.pdf` (or pass `--open <path>`) and the Reader route loads the file locally. A second instance forwards the path into the running window (single-instance plugin).

Window title: **NeoTools**. Deep-link scheme `neotools://` is registered via `tauri-plugin-deep-link`. The updater plugin is loaded; `pubkey` and `endpoints` are placeholders (`createUpdaterArtifacts: false` until a real minisign key exists). Menu (German labels): "Datei öffnen" (Open file), "Lizenz/Presets laden" (Load license/presets), "Werkzeuge" (Tools), "Über" (About). Optional tray icon.

## Prerequisites

- Rust stable via [rustup](https://rustup.rs/) (`cargo` on `PATH`)
- Node 22 + pnpm 10 (monorepo root)
- System WebView:
  - Linux: WebKitGTK 4.1 (`libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `patchelf`, `libssl-dev`, `libxdo-dev`, `libayatana-appindicator3-dev`)
  - Windows: WebView2
  - macOS: WKWebView (Xcode CLT)

On Ubuntu 24.04, `libappindicator3-dev` conflicts with `libayatana-appindicator3-dev` — install **only** the Ayatana package.

## Local build

From the monorepo root:

```bash
pnpm install
pnpm --filter @neotools/desktop icon          # regenerates src-tauri/icons from icon.svg
pnpm --filter @neotools/web build
cd apps/desktop
pnpm tauri build
```

Linux artefacts land in `src-tauri/target/release/bundle/`:

- `deb/neotools_*.deb`
- `appimage/NeoTools_*.AppImage` (portable)

The Rust backend can be compiled without bundling:

```bash
source "$HOME/.cargo/env"
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo build --release --manifest-path apps/desktop/src-tauri/Cargo.toml
```

`target/` is gitignored. `pnpm --filter @neotools/desktop test` only validates `tauri.conf.json` so `pnpm -r test` stays green without a Rust toolchain.

## Windows installer and default PDF app

CI (`desktop.yml`) builds **NSIS `.exe`** and **WiX `.msi`**. The installer writes `fileAssociations` for `.pdf`.

To make NeoTools the default PDF handler after install:

1. Right-click any `.pdf` → **Open with** → **Choose another app**
2. Select **NeoTools**
3. Check **Always use this app to open .pdf files**

Or: Settings → Apps → Default apps → `.pdf` → NeoTools.

Portable Windows: the NSIS installer is configured with `installMode: both` (per-user and machine). The unpackaged `NeoTools.exe` next to the web assets also works as a folder portable build from `target/release/` (no Start-menu registration). For a true portable PDF association, run the installer once or use “Open with”.

## macOS

CI builds a **universal `.dmg`** (`aarch64` + `x86_64`). File types come from `CFBundleDocumentTypes` generated from `fileAssociations`. Set NeoTools as the default PDF app via Get Info → Open with → Change All.

## Opening files

| Source | Behaviour |
|---|---|
| `--open /path/file.pdf` | Stored, then frontend calls `read_opened_file()` |
| Bare `*.pdf` argv (Windows/Linux association) | Same |
| macOS `RunEvent::Opened` | Same |
| Second-instance argv | Single-instance plugin focuses the window and emits `open-file` |
| `neotools://…` | Emitted as `open-deep-link` |

Frontend commands: `read_opened_file`, `read_file(path)`, `save_file(path, bytes)`, `pick_save_path` (native “Save as”).

## Code signing (optional CI secrets)

Do **not** commit keys. The workflow reads these if present; unsigned builds still upload.

**Updater (Ed25519 / minisign)** — only if you later enable the updater plugin:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

**Windows Authenticode**

- EV/OV certificate via `WINDOWS_CERTIFICATE_THUMBPRINT` + local store, or a `.pfx` in the WiX/NSIS config
- **Azure Trusted Signing** (preferred for CI): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, plus the Trusted Signing account/endpoint in the workflow when you wire it

**macOS notarization**

- `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` (Developer ID Application, base64 p12)
- `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`

The updater public key in `tauri.conf.json` is a labelled placeholder. Do not ship it as a real key.
