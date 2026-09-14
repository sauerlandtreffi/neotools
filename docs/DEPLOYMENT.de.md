🇩🇪 Deutsch · [🇬🇧 English](./DEPLOYMENT.md)

# NeoTools Self-Hosting

Schritt-für-Schritt für Docker Compose. Die Web-App bleibt zustandslos (kein Server-Speicher für Dateien). Die optionale API hält Jobs nur im RAM.

## 1. Voraussetzungen

- Docker + Compose
- Node 22 / pnpm 10 nur für lokalen Build ohne Docker
- Optional: eigenes `branding.json`, Team-`presets.json`, Ed25519-Lizenz

## 2. Start

```bash
cd /path/to/Neotools
cp deploy/docker/.env.example deploy/docker/.env
# Keys in .env anpassen — keine echten Secrets committen
docker compose -f deploy/docker/docker-compose.yml up --build
```

- Web: `http://localhost:8080`
- API (nur intern, über nginx): `http://localhost:8080/api/v1/health`
- Docs: `http://localhost:8080/api/v1/docs`
- OpenAPI 3.1: `http://localhost:8080/api/v1/openapi.json`

## 3. Branding

`NEOTOOLS_BRANDING` zeigt auf eine JSON-Datei (siehe `deploy/docker/README.de.md` und [BRANDING.de.md](./BRANDING.de.md)). `hiddenTools` gilt zur Build-Zeit. `license` / `licensePubkey` werden eingebettet; leer = Community.

## 4. Team-Presets

`presets.json` im Schema von `@neotools/engine` `teamPresetsSchema` (`organization`, `defaults`, `locked`, `hiddenTools`, `requiredPipelines`). Optional Ed25519-Signatur (`signature`). CLI: `--presets` oder `NEOTOOLS_PRESETS`. API wendet dieselben Presets serverseitig an. Enforcement (gesperrte Optionen) ist Feature `presets` (Pro/Enterprise); Community-Tools bleiben nutzbar.

## 5. Lizenz

```bash
node apps/cli/dist/cli.js license keygen --out /tmp/neotools-ed25519.json
node apps/cli/dist/cli.js license issue --org "Kanzlei" --plan pro --days 365 \
  --features api,watch,presets,whitelabel --key /tmp/neotools-ed25519.json
```

Public Key nach `branding.json` → `licensePubkey` oder `license-pubkey.json`. Token nach `NEOTOOLS_LICENSE` oder Seite `/lizenz` (IndexedDB, lokale Prüfung).

**Gratis-Versprechen:** Community bleibt für **alle Werkzeuge** voll funktionsfähig (Browser, CLI `run`/`pipeline`). Gates nur: REST-API, Watch-Automatik, Team-Presets-Erzwingung, White-Label ohne „Powered by NeoTools“, signierter Audit-Export. Kein Phone-Home.

## 6. API mit curl

```bash
export KEY=dev-key-change-me
curl -sS http://127.0.0.1:8080/api/v1/health
curl -sS -H "Authorization: Bearer $KEY" http://127.0.0.1:8080/api/v1/tools | head
curl -sS -H "Authorization: Bearer $KEY" \
  -F "files=@a.pdf" -F "files=@b.pdf" -F 'options={}' \
  http://127.0.0.1:8080/api/v1/run/pdf-merge -o merged.pdf
curl -sS -H "Authorization: Bearer $KEY" \
  -F "files=@in.pdf" \
  -F 'spec={"steps":[{"toolId":"pdf-sanitize","options":{}}]}' \
  http://127.0.0.1:8080/api/v1/pipeline -o out.pdf
# asynchron
curl -sS -H "Authorization: Bearer $KEY" \
  -F "files=@in.pdf" \
  "http://127.0.0.1:8080/api/v1/run/pdf-sanitize?async=1"
curl -sS -H "Authorization: Bearer $KEY" http://127.0.0.1:8080/api/v1/jobs/<id>
```

Antwort: einzelne Datei oder ZIP. Report ohne Dateiinhalte in `X-NeoTools-Report` (Base64URL-JSON). Ungültiger Key → 401, zu groß → 413.

## 7. Watch-Ordner

CLI (Feature `watch`):

```bash
neotools watch ./in --pipeline pipeline.json --out ./out --pattern "*.pdf" --poll 2s
# oder --fs-events
```

Idempotenz über Hash-Journal in `out/.neotools-watch.jsonl`, Fehler nach `out/errors/`. Docker: `--profile watch`.

Web (Chromium): `/watch` — `showDirectoryPicker`, persistente Permission, Polling, Ausgabe `neotools-out/`, Journal im Verlauf. Firefox/Safari: nicht unterstützt.

## 8. Reverse-Proxy / TLS

Vor nginx (Caddy, Traefik, NPM) TLS beenden. Wichtige Header **durchreichen oder selbst setzen**:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Cross-Origin-Resource-Policy: same-origin`
- CSP ohne Dritt-Hosts (siehe `deploy/docker/nginx.conf`)

Ohne COOP/COEP können SharedArrayBuffer/WASM-Threads fehlen.

## 9. Backups

Nicht nötig für den Server: **zustandslos**. Keine Nutzerdateien, keine Sessions. Optional sichern: `branding.json`, `presets.json`, Lizenz-Public-Key, API-Key-Datei, Audit-JSONL (`NEOTOOLS_AUDIT_LOG`, nur Hashes/Metadaten).

## 10. Datenschutz (Kanzlei/Behörde)

- Verarbeitung im Browser der Nutzer oder in eurem Netz (API-Sidecar).
- Kein Upload zu NeoTools, kein Tracking, keine CDN-Laufzeit.
- API speichert Dateien nicht; nach der Antwort werden Buffer verworfen (tmpfs).
- Audit-JSONL enthält Hash, Tool, Optionsschlüssel, Dauer, Status — keine Inhalte.
- Community-Tools sind ohne Telemetrie voll nutzbar.

## Preis-/Plan-Matrix (Vorschlag)

**Vorschlag, kein verbindliches Angebot.**

| Plan | Preis-Idee | Inhalt |
| --- | --- | --- |
| Community | frei | Alle Werkzeuge lokal (Web/CLI). Kein Wasserzeichen. |
| Pro | pro Installation / Jahr | + REST-API, Watch-Automatik, Team-Presets-Erzwingung |
| Enterprise | nach Aufwand | + White-Label ohne Footer, signierter Audit-Export, Support |

Private Keys und echte Lizenzen gehören nicht ins Git.
