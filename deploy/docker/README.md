# NeoTools Self-Hosting (Docker)

Zwei Images:

1. **neotools** — nginx, statische Astro-Ausgabe, COOP/COEP/CSP. Browser-Tools bleiben lokal.
2. **api** — Node-22-Sidecar (`@neotools/api`), nur im internen Netz. Dateien nur RAM/tmpfs, kein Persistieren.

## Branding (White-Label)

`branding.json` (Name, Logo-Pfad, Farben, Impressum-Text, optional `license`, `licensePubkey`, `presetsPath`, `hiddenTools`) wird **zur Build-Zeit** gelesen.

```bash
export NEOTOOLS_BRANDING=/absolute/path/to/branding.json
export NEOTOOLS_LICENSE=   # optional, eingebettetes Token
docker compose -f deploy/docker/docker-compose.yml up --build
# http://localhost:8080
```

Felder:

| Feld | Bedeutung |
| --- | --- |
| `name` | Produktname in Header/Title |
| `tagline.de` / `tagline.en` | Untertitel |
| `logo` | Öffentlicher Pfad (z. B. `/logo.svg`) |
| `colors.primary` / `accent` / `ink` | Theme |
| `impressum` / `privacy` | Texte für `/impressum` und `/datenschutz` |
| `hiddenTools` | Tool-IDs, die aus Grid, Suche, Sitemap und Command-Palette verschwinden. |
| `license` / `licensePubkey` | Offline-Lizenz (Ed25519). Leer = Community, alle Tools frei. |
| `presetsPath` | Team-`presets.json` (Signatur optional). |
| `showPoweredBy` | `false` nur mit Feature `whitelabel`. |

Header, Footer, Theme-Color, Manifest-Name/Farben und das OG-Image (`/og.svg`) lesen dieselbe Datei.

## API (Sidecar)

Nicht auf den Host publiziert. nginx proxied `/api/` intern nach `api:3000`.

Env (siehe `.env.example`):

- `NEOTOOLS_API_KEYS` — Komma- oder dateibasierte Keys
- `NEOTOOLS_MAX_UPLOAD_BYTES`, `NEOTOOLS_MAX_PARALLEL`, `NEOTOOLS_JOB_TIMEOUT_MS`
- `NEOTOOLS_LICENSE` / `NEOTOOLS_LICENSE_PUBKEY` — Feature `api` für `/run` und `/pipeline`
- `NEOTOOLS_PRESETS` — serverseitiges Team-Preset (erzwungen)

## Watch-Profil

```bash
docker compose -f deploy/docker/docker-compose.yml --profile watch up --build
```

braucht Feature `watch` und ein `--pipeline` JSON.

## Header

nginx setzt COOP `same-origin`, COEP `credentialless`, CSP ohne externe Quellen, gzip/Brotli. `.wasm` bekommt `application/wasm`.
