# NeoTools Self-Hosting (Docker)

Statisches Hosting der Web-App hinter nginx. Alle Tools laufen im Browser der Nutzer — der Container liefert nur HTML/JS/WASM.

## Branding (White-Label)

`branding.json` (Name, Logo-Pfad, Farben, Impressum-Text) wird **zur Build-Zeit** gelesen:

```bash
export NEOTOOLS_BRANDING=/absolute/path/to/branding.json
docker compose -f deploy/docker/docker-compose.yml build
```

Default: Repo-Root `branding.json` (Kopie auch unter `deploy/docker/branding.json`).

Felder:

| Feld | Bedeutung |
| --- | --- |
| `name` | Produktname in Header/Title |
| `tagline.de` / `tagline.en` | Untertitel |
| `logo` | Öffentlicher Pfad (z. B. `/logo.svg`) |
| `colors.primary` / `accent` / `ink` | Theme |
| `impressum` / `privacy` | Texte für `/impressum` und `/datenschutz` |
| `hiddenTools` | Tool-IDs, die aus Grid, Suche, Sitemap und Command-Palette verschwinden. Routen werden nicht generiert. |
| `defaultLocale` | `de` oder `en` — steuert Manifest-`lang`, nicht das URL-Schema (Deutsch bleibt ohne Prefix). |
| `footerLinks` | Zusätzliche Footer-Links: `{ "href": "/docs", "label": { "de": "Docs", "en": "Docs" } }` |

Header, Footer, Theme-Color, Manifest-Name/Farben und das OG-Image (`/og.svg`) lesen dieselbe Datei. `hiddenTools` wirkt zur Build-Zeit.

## Start

```bash
# vom Monorepo-Root
docker compose -f deploy/docker/docker-compose.yml up --build
# http://localhost:8080
```

## Header

nginx setzt COOP `same-origin`, COEP `credentialless` (weniger brüchig als `require-corp` ohne CORP an jedem Asset), CSP ohne externe Quellen, gzip und Brotli (falls das Alpine-Modul verfügbar ist). `.wasm` bekommt `application/wasm`.
