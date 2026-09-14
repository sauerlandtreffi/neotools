🇬🇧 English · [🇩🇪 Deutsch](./BRANDING.de.md)

# Branding / white-label

NeoTools reads a `branding.json` at **build time** and derives the web app's name, logo, colors, footer,
legal texts, pricing and contact details from it. There is no runtime theming: changes require a
new build (Astro prerender). Source of the schema: `apps/web/src/lib/branding.ts`
(`interface Branding`, `normalize()`, `FALLBACK`).

Related: [DEPLOYMENT.md](./DEPLOYMENT.md) · [SECURITY-REVIEW.md](./SECURITY-REVIEW.md) (F19) ·
[README.md](../README.md#self-hosting--white-label)

## Locating the file

Order in `loadBranding()` — the first readable hit wins, otherwise `FALLBACK`:

1. explicit path (function argument, internal)
2. `NEOTOOLS_BRANDING=/path/branding.json`
3. `<repo>/branding.json` (relative to `apps/web`: `../../branding.json`)
4. `branding.json` in the current working directory

Missing fields are merged with the Community fallback; empty strings in `legal.*`, `contact.*`,
`hosting.*` remain **visible placeholders** (`brandingSlot()`), so that no fabricated legal details
appear.

## Fields

### Header

| Field           | Type               | Default                                             | Effect                                                                                            |
| --------------- | ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `name`          | `string`           | `"NeoTools"`                                        | Page title, header, PWA manifest, `og.svg`, footer                                                |
| `tagline`       | `{ de, en }`       | "Werkzeuge, die den Rechner nicht verlassen." / …   | Hero subtitle, meta description of the start page                                                 |
| `logo`          | `string`           | `"/logo.svg"`                                       | Path **same-origin**, must start with `/` (`safeAssetUrl`); place the file under `apps/web/public/` |
| `colors`        | `BrandingColors`   | `primary #10221c`, `accent #3ee0b4`, `ink #e8efe9`  | CSS variables in the layout; only `#hex` or `rgb()/rgba()` (`safeCssColor`)                       |
| `defaultLocale` | `'de' \| 'en'`     | `'de'`                                              | Language without URL prefix; anything else falls back to `de`                                     |

### Visibility

| Field           | Type                        | Default                                     | Effect                                                                                                     |
| --------------- | --------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `hiddenTools`   | `string[]`                  | `[]`                                        | Tool IDs that are not shown in the grid or search and not built as pages (`toolPaths()`, `isHiddenTool()`) |
| `footerLinks`   | `{ href, label:{de,en} }[]` | `[]` (repo file: About/Pricing/Guides)      | Additional footer links; `href` relative, labels in both languages                                         |
| `showPoweredBy` | `boolean`                   | `true`                                      | "Powered by NeoTools" in the footer; a white-label license allows `false`                                  |

### Legal texts (`legal.*`)

Rendered as **templates** on `/impressum`, `/en/imprint`, `/datenschutz`, `/en/privacy` and `/ueber`.
Empty fields appear as placeholders. Not a substitute for legal advice.

| Field               | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `legal.operator`    | Operator (company / name)                                                  |
| `legal.address`     | Postal address (line breaks allowed)                                       |
| `legal.email`       | Contact e-mail; falls through to `contact.email` (and vice versa)          |
| `legal.phone`       | Phone                                                                      |
| `legal.vatId`       | VAT ID (USt-IdNr.)                                                         |
| `legal.register`    | Commercial register / register court (Handelsregister)                     |
| `legal.responsible` | Person responsible for content (§ 18 MStV)                                 |
| `legal.updated`     | Date of the last change to the legal texts (`YYYY-MM-DD`)                  |

The old free-text fields `impressum` and `privacy` (strings) remain in the schema for compatibility but are
no longer rendered (in the repo file they only contain the TODO note pointing to `legal.*`); new
installations fill in `legal.*`, `hosting.*`, `desktop.*`.

### Pricing (`pricing.*`)

Page `/preise` · `/en/pricing`. Values are free strings (e.g. `"49 € / year"`); empty or
`"auf Anfrage"` is output localized as "auf Anfrage" / "on request" (`brandingPrice()`).

| Field                         | Plan                                   |
| ----------------------------- | -------------------------------------- |
| `pricing.pro.yearly`          | Pro, yearly                            |
| `pricing.pro.monthly`         | Pro, monthly                           |
| `pricing.enterprise.yearly`   | Enterprise / self-host, yearly         |
| `pricing.enterprise.monthly`  | Enterprise / self-host, monthly        |

### Contact (`contact.*`)

| Field            | Default                                  | Effect                                                               |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `contact.email`  | `""` (→ `legal.email`)                   | Contact on `/ueber`, `/preise`, reporting channel in `SECURITY.md`   |
| `contact.github` | `https://github.com/neotools/neotools`   | Repository link in the footer / `/ueber`                             |

### Hosting (`hosting.*`)

For the privacy text: where the **static** web app is served from (files are never uploaded,
but the host sees access logs).

| Field              | Example                  |
| ------------------ | ------------------------ |
| `hosting.provider` | `"Hetzner Online GmbH"`  |
| `hosting.region`   | `"Germany (FSN1)"`       |

### Desktop (`desktop.*`)

| Field                 | Default                                                     | Effect                                                                       |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `desktop.updateCheck` | `true`                                                      | Note in the privacy text whether the Tauri app checks for updates            |
| `desktop.releasesUrl` | `https://github.com/neotools/neotools/releases?q=desktop-v` | Download link in the landing/desktop section                                 |

### License and presets

| Field           | Env override                | Meaning                                                                                                                    |
| --------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `license`       | `NEOTOOLS_LICENSE`          | Embedded offline license token (`@neotools/license`, Ed25519). Empty ⇒ Community build                                     |
| `licensePubkey` | `NEOTOOLS_LICENSE_PUBKEY`   | Public key (hex); otherwise `license-pubkey.json` in the repo root. Without a pubkey **every** token is invalid (fail-closed, F6) |
| `presetsPath`   | `NEOTOOLS_PRESETS`          | Path to team presets JSON (lock tools, set defaults); applied to the registry at build time                                |

The license only unlocks platform extras (API, watch, presets, white-label without "Powered by", audit).
All tools are usable without a license.

## Example

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
export NEOTOOLS_BRANDING=/path/branding.json
pnpm -r build                                # or just: pnpm --filter @neotools/web build
```

Place the logo and other assets under `apps/web/public/` (e.g. `apps/web/public/branding/logo.svg`) —
the path in `logo` must be same-origin. Favicon: replace `apps/web/public/favicon.svg`; the PWA manifest
(`/manifest.webmanifest`) takes `name` (`short_name` = first 12 characters), `og.svg` renders `name`.

### Docker

`deploy/docker/Dockerfile` copies `branding.json` from the build context (repo root) and sets
`ARG NEOTOOLS_BRANDING=/src/branding.json`. Your own file:

```bash
cp my-branding.json branding.json             # or adjust the Compose arg
export NEOTOOLS_LICENSE=…                     # optional, never commit to the repo
docker compose -f deploy/docker/docker-compose.yml up --build
```

The API (`Dockerfile.api`) receives the same `branding.json` as well as `NEOTOOLS_LICENSE`,
`NEOTOOLS_LICENSE_PUBKEY`, `NEOTOOLS_PRESETS` as environment variables (see `docker-compose.yml`).

### Desktop

The Tauri app loads `apps/web/dist`; branding therefore also applies to the desktop. Product name/bundle ID in
`apps/desktop/src-tauri/tauri.conf.json` must be set separately.

## Security rules (security review F19)

`branding.json` is configuration, not trusted code. `normalize()` therefore sanitizes:

- **`safeAssetUrl(value, fallback)`** — accepts only paths that start with `/`, not with `//`
  (protocol-relative) and contain no backslashes. `javascript:`, `data:`, `https://cdn…` fall back to
  `/logo.svg`. So there is no remote logo and no CDN dependency.
- **`safeCssColor(value, fallback)`** — only `#rgb`…`#rrggbbaa` or `rgb()/rgba()` with numeric
  arguments. Prevents CSS injection via `colors.*` (`;`, `url(`, `expression(`).
- **Escaping** — Astro/Preact escape free text (`name`, `tagline`, `legal.*`, `footerLinks.label`)
  automatically when rendering; for non-template output (e.g. SVG/text routes) `escapeHtml()` in
  `branding.ts` is available. HTML in `branding.json` appears as text, never as markup.
- `defaultLocale` is normalized to `de|en`; `footerLinks.href` should be relative (external links are
  allowed but must be mentioned in the privacy text).
- Secrets (`license`, API keys) belong in environment variables, not in a committed `branding.json`.

Tests: `apps/web/test/security-wave5.test.ts` covers `safeAssetUrl`/`safeCssColor`.
