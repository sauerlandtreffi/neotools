# Branding / White-Label

NeoTools liest zur **Build-Zeit** eine `branding.json` und erzeugt daraus Name, Logo, Farben, Footer,
Rechtstexte, Preis- und Kontaktangaben der Web-App. Es gibt kein Laufzeit-Theming: Änderungen erfordern
einen neuen Build (Astro-Prerender). Quelle des Schemas: `apps/web/src/lib/branding.ts`
(`interface Branding`, `normalize()`, `FALLBACK`).

Verwandt: [DEPLOYMENT.md](./DEPLOYMENT.md) · [SECURITY-REVIEW.md](./SECURITY-REVIEW.md) (F19) ·
[README.md](../README.md#branding)

## Datei finden

Reihenfolge in `loadBranding()` — der erste lesbare Treffer gewinnt, sonst `FALLBACK`:

1. expliziter Pfad (Funktionsargument, intern)
2. `NEOTOOLS_BRANDING=/pfad/branding.json`
3. `<repo>/branding.json` (relativ zu `apps/web`: `../../branding.json`)
4. `branding.json` im aktuellen Arbeitsverzeichnis

Fehlende Felder werden mit dem Community-Fallback gemischt; leere Strings in `legal.*`, `contact.*`,
`hosting.*` bleiben **sichtbare Platzhalter** (`brandingSlot()`), damit keine erfundenen Rechtsangaben
entstehen.

## Felder

### Kopf

| Feld            | Typ                | Default                                             | Wirkung                                                                                          |
| --------------- | ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `name`          | `string`           | `"NeoTools"`                                        | Seitentitel, Header, PWA-Manifest, `og.svg`, Footer                                             |
| `tagline`       | `{ de, en }`       | „Werkzeuge, die den Rechner nicht verlassen.“ / …   | Hero-Untertitel, Meta-Description der Startseite                                                |
| `logo`          | `string`           | `"/logo.svg"`                                       | Pfad **same-origin**, muss mit `/` beginnen (`safeAssetUrl`); Datei nach `apps/web/public/` legen |
| `colors`        | `BrandingColors`   | `primary #10221c`, `accent #3ee0b4`, `ink #e8efe9`  | CSS-Variablen im Layout; nur `#hex` oder `rgb()/rgba()` (`safeCssColor`)                         |
| `defaultLocale` | `'de' \| 'en'`     | `'de'`                                              | Sprache ohne URL-Prefix; alles andere fällt auf `de` zurück                                     |

### Sichtbarkeit

| Feld            | Typ                    | Default | Wirkung                                                                                                        |
| --------------- | ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `hiddenTools`   | `string[]`             | `[]`    | Tool-IDs, die nicht im Grid, in der Suche und nicht als Seite gebaut werden (`toolPaths()`, `isHiddenTool()`)  |
| `footerLinks`   | `{ href, label:{de,en} }[]` | `[]` (Repo-Datei: Über/Preise/Anleitungen) | Zusätzliche Footer-Links; `href` relativ, Labels in beiden Sprachen |
| `showPoweredBy` | `boolean`              | `true`  | „Powered by NeoTools“ im Footer; White-Label-Lizenz erlaubt `false`                                            |

### Rechtstexte (`legal.*`)

Werden auf `/impressum`, `/en/imprint`, `/datenschutz`, `/en/privacy` und `/ueber` als **Vorlagen**
gerendert. Leere Felder erscheinen als Platzhalter. Kein Ersatz für Rechtsberatung.

| Feld                | Bedeutung                                                              |
| ------------------- | ---------------------------------------------------------------------- |
| `legal.operator`    | Betreiber (Firma / Name)                                               |
| `legal.address`     | Anschrift (Zeilenumbrüche erlaubt)                                     |
| `legal.email`       | Kontakt-E-Mail; fällt auf `contact.email` durch (und umgekehrt)        |
| `legal.phone`       | Telefon                                                                |
| `legal.vatId`       | USt-IdNr.                                                              |
| `legal.register`    | Handelsregister / Registergericht                                      |
| `legal.responsible` | Inhaltlich Verantwortliche(r) (§ 18 MStV)                              |
| `legal.updated`     | Datum der letzten Änderung der Rechtstexte (`YYYY-MM-DD`)              |

Die alten Freitextfelder `impressum` und `privacy` (Strings) bleiben aus Kompatibilität im Schema, werden
aber nicht mehr gerendert (sie enthalten in der Repo-Datei nur den TODO-Hinweis auf `legal.*`); neue
Installationen füllen `legal.*`, `hosting.*`, `desktop.*`.

### Preise (`pricing.*`)

Seite `/preise` · `/en/pricing`. Werte sind freie Strings (z. B. `"49 € / Jahr"`); leer oder
`"auf Anfrage"` wird lokalisiert als „auf Anfrage“ / „on request“ ausgegeben (`brandingPrice()`).

| Feld                          | Plan                                   |
| ----------------------------- | -------------------------------------- |
| `pricing.pro.yearly`          | Pro, jährlich                          |
| `pricing.pro.monthly`         | Pro, monatlich                         |
| `pricing.enterprise.yearly`   | Enterprise / Self-Host, jährlich       |
| `pricing.enterprise.monthly`  | Enterprise / Self-Host, monatlich      |

### Kontakt (`contact.*`)

| Feld             | Default                                  | Wirkung                                                              |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `contact.email`  | `""` (→ `legal.email`)                   | Kontakt auf `/ueber`, `/preise`, Meldeweg in `SECURITY.md`           |
| `contact.github` | `https://github.com/neotools/neotools`   | Repository-Link im Footer / `/ueber`                                 |

### Hosting (`hosting.*`)

Für den Datenschutz-Text: Wo wird die **statische** Web-App ausgeliefert (Dateien werden nie
hochgeladen, aber der Hoster sieht Zugriffslogs).

| Feld               | Beispiel                 |
| ------------------ | ------------------------ |
| `hosting.provider` | `"Hetzner Online GmbH"`  |
| `hosting.region`   | `"Deutschland (FSN1)"`   |

### Desktop (`desktop.*`)

| Feld                  | Default                                                     | Wirkung                                                                      |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `desktop.updateCheck` | `true`                                                      | Hinweis im Datenschutz-Text, ob die Tauri-App Updates prüft                  |
| `desktop.releasesUrl` | `https://github.com/neotools/neotools/releases?q=desktop-v` | Download-Link auf der Landing-/Desktop-Sektion                               |

### Lizenz und Presets

| Feld            | Env-Override                | Bedeutung                                                                                                             |
| --------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `license`       | `NEOTOOLS_LICENSE`          | Eingebettetes Offline-Lizenz-Token (`@neotools/license`, Ed25519). Leer ⇒ Community-Build                             |
| `licensePubkey` | `NEOTOOLS_LICENSE_PUBKEY`   | Public Key (hex); sonst `license-pubkey.json` im Repo-Root. Ohne Pubkey ist **jedes** Token ungültig (fail-closed, F6) |
| `presetsPath`   | `NEOTOOLS_PRESETS`          | Pfad zu Team-Presets-JSON (Tools sperren, Defaults setzen); wird beim Build auf die Registry angewandt                |

Die Lizenz schaltet nur Plattform-Extras (API, Watch, Presets, White-Label ohne „Powered by“, Audit).
Alle Tools sind ohne Lizenz nutzbar.

## Beispiel

```json
{
  "name": "Kanzlei Muster Tools",
  "tagline": { "de": "Akten lokal bearbeiten.", "en": "Process case files locally." },
  "logo": "/branding/logo.svg",
  "colors": { "primary": "#1b2a41", "accent": "#e0a458", "ink": "#f4f1ea" },
  "hiddenTools": ["audio-stems", "creator-meme-captions"],
  "defaultLocale": "de",
  "footerLinks": [{ "href": "/ueber", "label": { "de": "Über", "en": "About" } }],
  "showPoweredBy": false,
  "legal": {
    "operator": "Muster Rechtsanwälte PartG mbB",
    "address": "Musterstraße 1\n10115 Berlin",
    "email": "kanzlei@example.org",
    "phone": "+49 30 000000",
    "vatId": "DE000000000",
    "register": "AG Charlottenburg PR 0000",
    "responsible": "RA Max Muster",
    "updated": "2026-09-14"
  },
  "pricing": { "pro": { "yearly": "auf Anfrage", "monthly": "auf Anfrage" }, "enterprise": { "yearly": "", "monthly": "" } },
  "contact": { "email": "it@example.org", "github": "https://github.com/neotools/neotools" },
  "hosting": { "provider": "Eigenes Rechenzentrum", "region": "Berlin" },
  "desktop": { "updateCheck": false, "releasesUrl": "https://intranet.example.org/neotools/desktop" }
}
```

## Build

```bash
export NEOTOOLS_BRANDING=/pfad/branding.json
pnpm -r build                                # oder nur: pnpm --filter @neotools/web build
```

Logo und weitere Assets unter `apps/web/public/` (z. B. `apps/web/public/branding/logo.svg`) ablegen —
der Pfad in `logo` muss same-origin sein. Favicon: `apps/web/public/favicon.svg` ersetzen; das PWA-Manifest
(`/manifest.webmanifest`) übernimmt `name` (`short_name` = erste 12 Zeichen), `og.svg` rendert `name`.

### Docker

`deploy/docker/Dockerfile` kopiert `branding.json` aus dem Build-Kontext (Repo-Root) und setzt
`ARG NEOTOOLS_BRANDING=/src/branding.json`. Eigene Datei:

```bash
cp meine-branding.json branding.json          # oder Compose-Arg anpassen
export NEOTOOLS_LICENSE=…                     # optional, nie ins Repo committen
docker compose -f deploy/docker/docker-compose.yml up --build
```

Die API (`Dockerfile.api`) erhält dieselbe `branding.json` sowie `NEOTOOLS_LICENSE`,
`NEOTOOLS_LICENSE_PUBKEY`, `NEOTOOLS_PRESETS` als Umgebungsvariablen (siehe `docker-compose.yml`).

### Desktop

Die Tauri-App lädt `apps/web/dist`; Branding wirkt damit auch im Desktop. Produktname/Bundle-ID in
`apps/desktop/src-tauri/tauri.conf.json` sind separat zu setzen.

## Sicherheitsregeln (Security-Review F19)

`branding.json` ist Konfiguration, kein vertrauenswürdiger Code. `normalize()` säubert deshalb:

- **`safeAssetUrl(value, fallback)`** — akzeptiert nur Pfade, die mit `/` beginnen, nicht mit `//`
  (protocol-relative) und keine Backslashes enthalten. `javascript:`, `data:`, `https://cdn…` fallen auf
  `/logo.svg` zurück. Damit gibt es kein Remote-Logo und keine CDN-Abhängigkeit.
- **`safeCssColor(value, fallback)`** — nur `#rgb`…`#rrggbbaa` oder `rgb()/rgba()` mit numerischen
  Argumenten. Verhindert CSS-Injection über `colors.*` (`;` , `url(`, `expression(`).
- **Escaping** — Astro/Preact escapen Freitexte (`name`, `tagline`, `legal.*`, `footerLinks.label`) beim
  Rendern automatisch; für Nicht-Template-Ausgaben (z. B. SVG/Text-Routen) steht `escapeHtml()` in
  `branding.ts` bereit. HTML in `branding.json` erscheint als Text, niemals als Markup.
- `defaultLocale` wird auf `de|en` normiert, `footerLinks.href` sollte relativ sein (externe Links sind
  erlaubt, aber im Datenschutztext zu nennen).
- Geheimnisse (`license`, API-Keys) gehören in Umgebungsvariablen, nicht in eine committete `branding.json`.

Tests: `apps/web/test/security-wave5.test.ts` deckt `safeAssetUrl`/`safeCssColor` ab.
